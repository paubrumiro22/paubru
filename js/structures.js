'use strict';
// Structures scattered through the regular world (worlds made with generator version 2 and up):
// villages in five regional styles, castles on the heights, mines under the hills, fishing
// ports on the coast, watchtowers, ruins and lighthouses. The world is split into cells of
// STRUCT_CELL blocks; each cell deterministically plans at most one structure from the seed
// and the terrain height function, so any chunk (in any worker) can rebuild the parts of a
// structure that fall inside it. Plans also list where villagers and animals live and which
// chests hold loot. Loaded in the chunk workers too (data-w).

const STRUCT_CELL = 320;
const STRUCT_REACH = 110;       // no structure reaches further than this from its centre
const GEN_LATEST = 3;

// ---- building materials by village style ----
const VSTYLE = {
  temperate: { wall: B.PLASTER, alt: B.BRICKS, frame: B.LOG, floor: B.PLANKS, base: B.COBBLE, roof: 'tiles', ridge: B.ROOF_TILES, fence: B.OAK_FENCE, stairs: 'oak', pillar: 'oak' },
  forest: { wall: B.PLANKS, alt: B.PLASTER, frame: B.SPRUCE_LOG, floor: B.SPRUCE_PLANKS, base: B.COBBLE, roof: 'thatch', ridge: B.THATCH, fence: B.SPRUCE_FENCE, stairs: 'spruce', pillar: 'spruce' },
  snowy: { wall: B.SPRUCE_PLANKS, alt: B.STONE_BRICKS, frame: B.SPRUCE_LOG, floor: B.SPRUCE_PLANKS, base: B.STONE_BRICKS, roof: 'slate', ridge: B.SLATE, fence: B.SPRUCE_FENCE, stairs: 'spruce', pillar: 'spruce' },
  desert: { wall: B.SANDSTONE, alt: B.PLASTER, frame: B.SANDSTONE, floor: B.SANDSTONE, base: B.SANDSTONE, roof: 'flat', ridge: B.SANDSTONE, fence: B.OAK_FENCE, stairs: 'sandstone', pillar: 'sandstone', flat: true },
  tropical: { wall: B.BIRCH_PLANKS, alt: B.PLASTER, frame: B.PALM_LOG, floor: B.BIRCH_PLANKS, base: B.COBBLE, roof: 'thatch', ridge: B.THATCH, fence: B.OAK_FENCE, stairs: 'birch', pillar: 'oak' },
};
const PROFESSIONS = ['farmer', 'fisher', 'smith', 'librarian', 'cleric', 'mason', 'shepherd'];

// ---- a writer clipped to one chunk ----
function structWriter(chunk) {
  const ox = chunk.cx * CS, oz = chunk.cz * CS, b = chunk.blocks;
  return {
    ox, oz, x0: ox, z0: oz, x1: ox + CS - 1, z1: oz + CS - 1,
    has(x, z) { return x >= ox && x < ox + CS && z >= oz && z < oz + CS; },
    get(x, y, z) {
      if (x < ox || x >= ox + CS || z < oz || z >= oz + CS || y < 0 || y >= CH) return -1;
      return b[(y * CS + (z - oz)) * CS + (x - ox)];
    },
    set(x, y, z, id, f) {
      if (x < ox || x >= ox + CS || z < oz || z >= oz + CS || y < 1 || y >= CH) return;
      b[(y * CS + (z - oz)) * CS + (x - ox)] = id;
      const k = posKey(x, y, z);
      if (f !== undefined) (chunk.gfacing || (chunk.gfacing = new Map())).set(k, f);
      else if (chunk.gfacing) chunk.gfacing.delete(k);
    },
    pic(x, y, z, f, w, h, builtin) {
      if (!this.has(x, z)) return;
      (chunk.gpics || (chunk.gpics = [])).push({ x, y, z, f, w, h, builtin });
    },
    loot(x, y, z, kind) {
      if (!this.has(x, z)) return;
      (chunk.gloot || (chunk.gloot = new Map())).set(posKey(x, y, z), kind);
    },
  };
}
function rectHits(W, x0, z0, x1, z1) { return x1 >= W.x0 && x0 <= W.x1 && z1 >= W.z0 && z0 <= W.z1; }

// ---- shared pieces ----
// Fill a column from the terrain up to (not including) y with `id` and clear above up to `top`.
function footing(W, g, x, z, y, id, top) {
  if (!W.has(x, z)) return;
  const h = g.height(x, z);
  for (let yy = Math.min(h, y - 1); yy < y; yy++) if (yy > 0) W.set(x, yy, z, id);
  for (let yy = y; yy <= top; yy++) W.set(x, yy, z, B.AIR);
}

// Gable or flat roof over the rectangle x0..x1 / z0..z1 whose walls end below y.
function roofGable(W, x0, z0, x1, z1, y, st, wallId) {
  if (st.flat) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      W.set(x, y, z, st.ridge);
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (edge) W.set(x, y + 1, z, (x + z) % 2 ? B.SANDSTONE_SLAB : st.ridge);
    }
    return y + 1;
  }
  const slope = shapeId(st.roof, 'slope');
  const alongX = x1 - x0 >= z1 - z0;
  const lo = (alongX ? z0 : x0) - 1, hi = (alongX ? z1 : x1) + 1;
  const a0 = (alongX ? x0 : z0) - 1, a1 = (alongX ? x1 : z1) + 1;
  let top = y;
  for (let i = 0; lo + i <= hi - i; i++) {
    const yy = y + i, r0 = lo + i, r1 = hi - i;
    top = yy;
    for (let a = a0; a <= a1; a++) {
      const at = (r, id, f) => (alongX ? W.set(a, yy, r, id, f) : W.set(r, yy, a, id, f));
      if (r0 === r1) { at(r0, st.ridge); continue; }
      at(r0, slope, alongX ? 4 : 0);
      at(r1, slope, alongX ? 5 : 1);
    }
    // gable ends
    for (let r = Math.max(lo + 1, r0 + 1); r <= Math.min(hi - 1, r1 - 1); r++) {
      for (const a of [a0 + 1, a1 - 1]) (alongX ? W.set(a, yy, r, wallId) : W.set(r, yy, a, wallId));
    }
  }
  return top;
}

// Square pyramid roof (towers): outer corners at the ring corners, slopes on the sides.
function roofPyramid(W, x0, z0, size, y, roofKey, spire) {
  const slope = shapeId(roofKey, 'slope'), outer = shapeId(roofKey, 'outer');
  let i = 0;
  for (; size - 2 * i >= 2; i++) {
    const a = x0 + i, b = z0 + i, e = size - 1 - 2 * i, yy = y + i;
    for (let k = 1; k < e; k++) {
      W.set(a + k, yy, b, slope, 4); W.set(a + k, yy, b + e, slope, 5);
      W.set(a, yy, b + k, slope, 0); W.set(a + e, yy, b + k, slope, 1);
    }
    W.set(a, yy, b, outer, 4); W.set(a + e, yy, b, outer, 1); W.set(a + e, yy, b + e, outer, 5); W.set(a, yy, b + e, outer, 0);
  }
  if (size - 2 * i === 1) {
    const c = x0 + i, d = z0 + i;
    W.set(c, y + i, d, spire || B.SLATE);
    return y + i;
  }
  return y + i - 1;
}

function doorAt(W, x, y, z, f) { W.set(x, y, z, B.DOOR, f); W.set(x, y + 1, z, B.DOOR_TOP, f); }

// A house: foundation, walls with a timber frame and windows, door, roof and furniture.
// h: { x0, z0, x1, z1, F (floor level), door (outward side 0/1/4/5), st, floors, prof, seed }
function buildHouse(W, g, h) {
  const { x0, z0, x1, z1, F, st } = h;
  if (!rectHits(W, x0 - 2, z0 - 2, x1 + 2, z1 + 2)) return;
  const wallH = h.floors === 2 ? 7 : 4;
  const r = (k) => hash3(h.seed, k, 71, 3);
  const wall = r(1) < 0.3 ? st.alt : st.wall;
  // ground, footing and clearing
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
    const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
    if (!W.has(x, z)) continue;
    const gh = g.height(x, z);
    if (inside) {
      for (let y = Math.min(gh, F - 2); y < F - 1; y++) if (y > 0) W.set(x, y, z, st.base);
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      W.set(x, F - 1, z, edge ? st.base : st.floor);
    } else if (gh < F - 1) {
      for (let y = gh + 1; y < F - 1; y++) W.set(x, y, z, B.DIRT);
      W.set(x, F - 1, z, B.GRASS);
    }
    for (let y = F; y <= F + wallH + 7; y++) W.set(x, y, z, B.AIR);
  }
  // walls
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
  const doorPos = h.door === 5 ? [cx, z0] : h.door === 4 ? [cx, z1] : h.door === 1 ? [x0, cz] : [x1, cz];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (!edge) continue;
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
    for (let y = F; y < F + wallH; y++) {
      const band = y === F + wallH - 1 || (h.floors === 2 && y === F + 3);
      let id = corner || (band && st.frame !== st.wall) ? st.frame : wall;
      const along = x === x0 || x === x1 ? z : x;
      const win = !corner && !band && (y === F + 1 || (h.floors === 2 && y === F + 5)) && along % 2 === 0;
      if (win) id = B.GLASS_PANE;
      W.set(x, y, z, id);
    }
  }
  doorAt(W, doorPos[0], F, doorPos[1], h.door);
  const out = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] }[h.door];
  const sx = doorPos[0] + out[0], sz = doorPos[1] + out[1];
  if (W.has(sx, sz)) { W.set(sx, F - 1, sz, B.DIRT_PATH); W.set(sx, F, sz, B.AIR); W.set(sx, F + 1, sz, B.AIR); }
  // a lantern over the door
  W.set(sx, F + 2, sz, B.LANTERN, 8);
  // upper floor
  if (h.floors === 2) {
    for (let x = x0 + 1; x < x1; x++) for (let z = z0 + 1; z < z1; z++) W.set(x, F + 3, z, st.floor);
    W.set(x0 + 1, F + 3, z0 + 1, B.AIR);
    for (let y = F; y <= F + 3; y++) W.set(x0 + 1, y, z0 + 1, B.LADDER, 0);
  }
  const top = roofGable(W, x0, z0, x1, z1, F + wallH, st, wall);
  // chimney on some houses
  if (!st.flat && r(2) < 0.45) for (let y = F; y <= top + 1; y++) W.set(x1 - 1, y, z1 - 1, y >= F + wallH ? B.BRICKS : B.AIR);
  // furniture
  const ix0 = x0 + 1, iz0 = z0 + 1, ix1 = x1 - 1, iz1 = z1 - 1;
  const spots = [[ix0, iz1], [ix1, iz1], [ix1, iz0], [ix0 + 1, iz1]].filter(([x, z]) => !(x === doorPos[0] + (-out[0]) && z === doorPos[1] + (-out[1])));
  const put = (i, id, f) => { const s = spots[i % spots.length]; if (s && !(s[0] === x0 + 1 && s[1] === z0 + 1 && h.floors === 2)) W.set(s[0], F, s[1], id, f); };
  put(0, B.BED, 0);
  const prof = h.prof;
  if (prof === 'smith') { put(1, B.FURNACE, 4); put(2, B.CHEST, 4); W.loot(spots[2][0], F, spots[2][1], 'smith'); }
  else if (prof === 'librarian') { put(1, B.BOOKSHELF); put(2, B.BOOKSHELF); put(3, B.CRAFTING_TABLE); }
  else if (prof === 'farmer' || prof === 'shepherd') { put(1, B.HAY_BALE); put(2, B.BARREL); W.loot(spots[2][0], F, spots[2][1], 'farm'); }
  else if (prof === 'fisher') { put(1, B.BARREL); W.loot(spots[1][0], F, spots[1][1], 'fish'); put(2, B.CRAFTING_TABLE); }
  else if (prof === 'mason') { put(1, B.ARCH_TABLE); put(2, B.CHEST, 4); W.loot(spots[2][0], F, spots[2][1], 'house'); }
  else { put(1, B.CRAFTING_TABLE); put(2, B.CHEST, 4); W.loot(spots[2][0], F, spots[2][1], 'house'); }
  W.set(cx, F + (h.floors === 2 ? 2 : wallH - 1), cz, B.LANTERN, 8);
  if (h.floors === 2) W.set(cx, F + wallH - 1, cz, B.LANTERN, 8);
}

function buildWell(W, g, x, z, F, st) {
  if (!rectHits(W, x - 3, z - 3, x + 3, z + 3)) return;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const X = x + dx, Z = z + dz;
    if (!W.has(X, Z)) continue;
    footing(W, g, X, Z, F, st.base, F + 6);
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    W.set(X, F - 1, Z, ring >= 2 ? B.DIRT_PATH : st.base);
    if (ring === 1) W.set(X, F, Z, st.base);
    if (ring === 0) { for (let y = F - 5; y < F; y++) W.set(X, y, Z, B.WATER); W.set(X, F - 6, Z, st.base); }
    if (ring === 1 && Math.abs(dx) === 1 && Math.abs(dz) === 1) { W.set(X, F + 1, Z, st.fence); W.set(X, F + 2, Z, st.fence); }
  }
  roofPyramid(W, x - 1, z - 1, 3, F + 3, st.flat ? 'sandstone' : st.roof);
}

function buildFarm(W, g, x0, z0, x1, z1, F, st, seed) {
  if (!rectHits(W, x0 - 1, z0 - 1, x1 + 1, z1 + 1)) return;
  const alongX = x1 - x0 >= z1 - z0, mid = alongX ? (z0 + z1) >> 1 : (x0 + x1) >> 1;
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
    if (!W.has(x, z)) continue;
    footing(W, g, x, z, F, B.DIRT, F + 3);
    const edge = x < x0 || x > x1 || z < z0 || z > z1;
    if (edge) { W.set(x, F - 1, z, st.base === B.SANDSTONE ? B.SANDSTONE : B.LOG); continue; }
    if ((alongX ? z : x) === mid) { W.set(x, F - 1, z, B.WATER); continue; }
    W.set(x, F - 1, z, B.FARMLAND);
    const r = hash3(x, F, z, seed);
    W.set(x, F, z, r < 0.7 ? B.WHEAT_3 : r < 0.85 ? B.WHEAT_2 : B.WHEAT_1);
  }
}

function buildPen(W, g, x0, z0, x1, z1, F, st) {
  if (!rectHits(W, x0, z0, x1, z1)) return;
  const gx = (x0 + x1) >> 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (!W.has(x, z)) continue;
    footing(W, g, x, z, F, B.DIRT, F + 3);
    W.set(x, F - 1, z, B.GRASS);
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (edge && !(z === z0 && x === gx)) W.set(x, F, z, st.fence);
  }
  W.set(x0 + 1, F, z1 - 1, B.HAY_BALE);
}

function buildLampPost(W, x, y, z, st) {
  if (!W.has(x, z)) return;
  W.set(x, y, z, st.fence); W.set(x, y + 1, z, st.fence); W.set(x, y + 2, z, st.fence); W.set(x, y + 3, z, B.LANTERN, 0);
}

function buildStall(W, g, x, z, F, st, seed) {
  if (!rectHits(W, x - 1, z - 1, x + 1, z + 1)) return;
  const wool = B.WOOL + [14, 4, 11, 1, 5, 10][Math.floor(hash3(x, 5, z, seed) * 6)];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const X = x + dx, Z = z + dz;
    if (!W.has(X, Z)) continue;
    footing(W, g, X, Z, F, st.base, F + 4);
    W.set(X, F - 1, Z, B.DIRT_PATH);
    if (Math.abs(dx) === 1 && Math.abs(dz) === 1) { W.set(X, F, Z, st.fence); W.set(X, F + 1, Z, st.fence); }
    W.set(X, F + 2, Z, (dx + dz) % 2 ? wool : B.WOOL);
  }
  W.set(x, F, z, B.BARREL);
  W.set(x + 1, F, z, [B.MELON, B.PUMPKIN, B.HAY_BALE][Math.floor(hash3(x, 9, z, seed) * 3)]);
}

// Bell tower / chapel
function buildChapel(W, g, x0, z0, F, st, door) {
  const w = 7, d = 9, x1 = x0 + w - 1, z1 = z0 + d - 1;
  if (!rectHits(W, x0 - 2, z0 - 2, x1 + 2, z1 + 2)) return;
  const stone = st.flat ? B.SANDSTONE : B.STONE_BRICKS;
  const tst = Object.assign({}, st, { wall: stone, alt: stone, frame: stone, floor: B.SMOOTH_STONE, base: stone });
  buildHouse(W, g, { x0, z0, x1, z1, F, door, st: tst, floors: 1, prof: 'cleric', seed: x0 * 31 + z0 });
  // tower over the back part
  const tx = x0 + 2, tz = door === 5 ? z1 - 2 : z0;
  for (let y = F; y < F + 12; y++) for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
    const edge = dx !== 1 || dz !== 1;
    W.set(tx + dx, y, tz + dz, edge ? (y >= F + 8 && y <= F + 9 && (dx === 1 || dz === 1) ? B.AIR : stone) : B.AIR);
  }
  W.set(tx + 1, F + 8, tz + 1, B.GOLD_BLOCK);
  roofPyramid(W, tx - 1, tz - 1, 5, F + 12, st.flat ? 'sandstone' : 'slate', B.LANTERN);
}

// ---- villages ----
function planVillage(g, cx, cz, rng, style) {
  const st = VSTYLE[style];
  const F0 = g.height(cx, cz) + 1;
  const plan = { type: 'village', style, x: cx, z: cz, y: F0, pieces: [], zones: [], spawns: [], radius: 0 };
  const zones = plan.zones;
  const free = (x0, z0, x1, z1) => !zones.some((r) => x1 + 2 >= r[0] && x0 - 2 <= r[2] && z1 + 2 >= r[1] && z0 - 2 <= r[3]);
  const siteOK = (x0, z0, x1, z1) => {
    let lo = 1e9, hi = -1e9;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) >> 1, (z0 + z1) >> 1]]) {
      const h = g.height(x, z);
      if (h < SEA || regionNear(g, x, z, 0)) return false;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return hi - lo <= 6;
  };
  // plaza and well
  zones.push([cx - 4, cz - 4, cx + 4, cz + 4]);
  plan.pieces.push({ box: [cx - 3, cz - 3, cx + 3, cz + 3], build: (W) => buildWell(W, g, cx, cz, F0, st) });
  // roads
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nRoads = 2 + (rng() < 0.7 ? 1 : 0) + (rng() < 0.4 ? 1 : 0);
  const start = Math.floor(rng() * 4);
  const road = [];
  let profI = Math.floor(rng() * PROFESSIONS.length), chapel = rng() < 0.6, farms = 0, pens = 0, stalls = 0;
  for (let ri = 0; ri < nRoads; ri++) {
    const [dx, dz] = dirs[(start + ri) % 4];
    const len = 26 + Math.floor(rng() * 22);
    for (let t = 4; t <= len; t++) {
      const px = cx + dx * t, pz = cz + dz * t;
      for (let w = -1; w <= 1; w++) road.push([px + (dz ? w : 0), pz + (dx ? w : 0)]);
      if (t % 10 === 5) plan.pieces.push({ box: [px + dz * 2, pz + dx * 2, px + dz * 2, pz + dx * 2], build: (W) => buildLampPost(W, px + dz * 2, g.height(px + dz * 2, pz + dx * 2) + 1, pz + dx * 2, st) });
    }
    plan.radius = Math.max(plan.radius, len + 12);
    // lots on both sides of the road
    for (let t = 7; t <= len - 2; t += 8 + Math.floor(rng() * 2)) {
      for (const side of [-1, 1]) {
        if (rng() < 0.1) continue;
        const px = cx + dx * t, pz = cz + dz * t;
        // perpendicular offset from the road centre line
        const ox = dz * side, oz = dx * side;
        const kind = rng();
        let w = 5 + Math.floor(rng() * 3), d = 5 + Math.floor(rng() * 2), floors = 1;
        let type = 'house';
        if (chapel && t > 12) { type = 'chapel'; w = 7; d = 9; chapel = false; }
        else if (kind < 0.18 && farms < 3) { type = 'farm'; w = 9; d = 7; farms++; }
        else if (kind < 0.26 && pens < 2) { type = 'pen'; w = 7; d = 7; pens++; }
        else if (kind < 0.33 && stalls < 3) { type = 'stall'; w = 3; d = 3; stalls++; }
        else if (kind > 0.85) { w = 7; d = 7; floors = 2; }
        // footprint: near edge 3 blocks from the road centre
        const along = dx ? [px - (w >> 1), px - (w >> 1) + w - 1] : [pz - (w >> 1), pz - (w >> 1) + w - 1];
        const near = 3, far = near + d - 1;
        let x0, z0, x1, z1;
        if (dx) { x0 = along[0]; x1 = along[1]; if (oz > 0) { z0 = pz + near; z1 = pz + far; } else { z0 = pz - far; z1 = pz - near; } }
        else { z0 = along[0]; z1 = along[1]; if (ox > 0) { x0 = px + near; x1 = px + far; } else { x0 = px - far; x1 = px - near; } }
        if (!free(x0, z0, x1, z1) || !siteOK(x0, z0, x1, z1)) continue;
        zones.push([x0, z0, x1, z1]);
        const F = g.height((x0 + x1) >> 1, (z0 + z1) >> 1) + 1;
        // door on the side that faces the road
        const door = dx ? (oz > 0 ? 5 : 4) : (ox > 0 ? 1 : 0);
        const seed = hash3(x0, 7, z0, g.seed) * 1e6 | 0;
        if (type === 'farm') plan.pieces.push({ box: [x0 - 1, z0 - 1, x1 + 1, z1 + 1], build: (W) => buildFarm(W, g, x0, z0, x1, z1, F, st, seed) });
        else if (type === 'pen') {
          plan.pieces.push({ box: [x0, z0, x1, z1], build: (W) => buildPen(W, g, x0, z0, x1, z1, F, st) });
          const animal = ['sheep', 'cow', 'pig', 'chicken'][Math.floor(rng() * 4)];
          for (let i = 0; i < 3; i++) plan.spawns.push({ kind: animal, x: (x0 + x1) / 2 + 0.5 + (i - 1), y: F, z: (z0 + z1) / 2 + 0.5 });
        } else if (type === 'stall') plan.pieces.push({ box: [x0 - 1, z0 - 1, x1 + 1, z1 + 1], build: (W) => buildStall(W, g, (x0 + x1) >> 1, (z0 + z1) >> 1, F, st, seed) });
        else if (type === 'chapel') {
          plan.pieces.push({ box: [x0 - 2, z0 - 2, x1 + 2, z1 + 2], build: (W) => buildChapel(W, g, x0, z0, F, st, door) });
          plan.spawns.push({ kind: 'villager', prof: 'cleric', x: (x0 + x1) / 2 + 0.5, y: F, z: (z0 + z1) / 2 + 0.5 });
        } else {
          const prof = PROFESSIONS[profI++ % PROFESSIONS.length];
          plan.pieces.push({ box: [x0 - 2, z0 - 2, x1 + 2, z1 + 2], build: (W) => buildHouse(W, g, { x0, z0, x1, z1, F, door, st, floors, prof, seed }) });
          plan.spawns.push({ kind: 'villager', prof, x: (x0 + x1) / 2 + 0.5, y: F, z: (z0 + z1) / 2 + 0.5 });
        }
      }
    }
  }
  // paths follow the ground; over water they become plank bridges
  const roadSet = new Map();
  for (const [x, z] of road) roadSet.set(x * 100003 + z, [x, z]);
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) >= 3) roadSet.set((cx + dx) * 100003 + cz + dz, [cx + dx, cz + dz]);
  const cells = [...roadSet.values()];
  let rx0 = 1e9, rz0 = 1e9, rx1 = -1e9, rz1 = -1e9;
  for (const [x, z] of cells) { rx0 = Math.min(rx0, x); rz0 = Math.min(rz0, z); rx1 = Math.max(rx1, x); rz1 = Math.max(rz1, z); }
  plan.pieces.unshift({
    box: [rx0, rz0, rx1, rz1],
    build: (W) => {
      for (const [x, z] of cells) {
        if (!W.has(x, z)) continue;
        if (zones.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) && !(Math.abs(x - cx) <= 4 && Math.abs(z - cz) <= 4)) continue;
        const h = g.height(x, z);
        if (h < SEA) { W.set(x, SEA, z, st.floor === B.SANDSTONE ? B.PLANKS : st.floor); W.set(x, SEA + 1, z, B.AIR); continue; }
        const top = W.get(x, h, z);
        if (top > 0 && BLOCK_SOLID[top]) W.set(x, h, z, st.flat ? B.SANDSTONE : B.DIRT_PATH);
        for (let y = h + 1; y <= h + 3; y++) { const b = W.get(x, y, z); if (b > 0 && (!BLOCK_SOLID[b] || BLOCK_RT[b] === RT_CROSS) && !IS_LIQUID(b)) W.set(x, y, z, B.AIR); }
      }
    },
  });
  plan.name = villageName(cx, cz, g.seed);
  // a couple of villagers wander the plaza
  plan.spawns.push({ kind: 'villager', prof: PROFESSIONS[profI++ % PROFESSIONS.length], x: cx + 2.5, y: F0, z: cz + 0.5 });
  return plan;
}

// ---- castle ----
function planCastle(g, cx, cz, rng) {
  const R = 13;
  let top = 0;
  for (let dx = -R; dx <= R; dx += 4) for (let dz = -R; dz <= R; dz += 4) top = Math.max(top, g.height(cx + dx, cz + dz));
  const F = top + 1;
  const plan = { type: 'castle', x: cx, z: cz, y: F, pieces: [], zones: [[cx - R - 2, cz - R - 2, cx + R + 2, cz + R + 2]], spawns: [], radius: R + 6 };
  const gate = Math.floor(rng() * 4);
  plan.pieces.push({ box: [cx - R - 2, cz - R - 2, cx + R + 2, cz + R + 2], build: (W) => buildCastle(W, g, cx, cz, F, R, gate) });
  plan.spawns.push({ kind: 'villager', prof: 'smith', x: cx + 3.5, y: F, z: cz + 5.5 });
  plan.spawns.push({ kind: 'villager', prof: 'cleric', x: cx - 3.5, y: F, z: cz - 5.5 });
  return plan;
}
function buildCastle(W, g, cx, cz, F, R, gate) {
  if (!rectHits(W, cx - R - 2, cz - R - 2, cx + R + 2, cz + R + 2)) return;
  const S = B.STONE_BRICKS, M = B.MOSSY_COBBLE, wallH = 9;
  const mossy = (x, y, z) => (hash3(x, y, z, 99) < 0.12 ? M : S);
  for (let x = cx - R - 1; x <= cx + R + 1; x++) for (let z = cz - R - 1; z <= cz + R + 1; z++) {
    if (!W.has(x, z)) continue;
    footing(W, g, x, z, F, S, F + 30);
    const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    W.set(x, F - 1, z, ring <= R ? (ring < 3 ? B.DIRT_PATH : B.GRASS) : S);
    // curtain wall with a walkway and battlements
    if (ring === R) {
      for (let y = F; y < F + wallH; y++) W.set(x, y, z, mossy(x, y, z));
      if ((x + z) % 2 === 0) W.set(x, F + wallH, z, S);
      if (ring === R && y0Window(x, z, cx, cz)) W.set(x, F + 3, z, B.IRON_BARS);
    }
    if (ring === R - 1) W.set(x, F + wallH - 1, z, S);
  }
  // gate with a round arch
  const gd = [[0, -1], [1, 0], [0, 1], [-1, 0]][gate];
  const gx = cx + gd[0] * R, gz = cz + gd[1] * R;
  const along = gd[0] ? [0, 1] : [1, 0];
  for (let k = -1; k <= 2; k++) {
    const x = gx + along[0] * k, z = gz + along[1] * k;
    if (k === -1 || k === 2) continue;
    for (let y = F; y < F + 3; y++) W.set(x, y, z, B.AIR);
  }
  const archA = shapeId('stone_brick', 'arch');
  const fA = gd[0] ? 5 : 1, fB = gd[0] ? 4 : 0;
  W.set(gx + along[0] * 0, F + 3, gz + along[1] * 0, archA, fA);
  W.set(gx + along[0] * 1, F + 3, gz + along[1] * 1, archA, fB);
  // corner towers
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const tx = cx + sx * R - 2, tz = cz + sz * R - 2;
    for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
      const x = tx + dx, z = tz + dz;
      if (!W.has(x, z)) continue;
      footing(W, g, x, z, F, S, F + 20);
      const edge = dx === 0 || dx === 4 || dz === 0 || dz === 4;
      for (let y = F; y < F + 13; y++) {
        let id = edge ? mossy(x, y, z) : B.AIR;
        if (edge && (y === F + 5 || y === F + 9) && (dx === 2 || dz === 2)) id = B.IRON_BARS;
        W.set(x, y, z, id);
      }
      if (!edge) { W.set(x, F + 5, z, B.SPRUCE_PLANKS); W.set(x, F + 9, z, B.SPRUCE_PLANKS); }
    }
    for (let y = F; y < F + 13; y++) W.set(tx + 1, y, tz + 2, B.LADDER, 0);
    W.set(tx + 1, F + 5, tz + 2, B.LADDER, 0); W.set(tx + 1, F + 9, tz + 2, B.LADDER, 0);
    roofPyramid(W, tx - 1, tz - 1, 7, F + 13, 'slate', B.LANTERN);
    W.set(tx + 3, F + 12, tz + 3, B.LANTERN, 8);
  }
  // keep
  const K = 5, kx = cx - K, kz = cz - K;
  for (let x = kx; x <= kx + 2 * K; x++) for (let z = kz; z <= kz + 2 * K; z++) {
    if (!W.has(x, z)) continue;
    const edge = x === kx || x === kx + 2 * K || z === kz || z === kz + 2 * K;
    for (let y = F; y < F + 15; y++) {
      let id = edge ? mossy(x, y, z) : B.AIR;
      if (edge && (y === F + 1 || y === F + 6 || y === F + 11) && (x - kx) % 3 === 1 && (z - kz) % 3 === 1) id = B.GLASS_PANE;
      if (edge && (y === F + 1 || y === F + 6 || y === F + 11) && ((x === kx || x === kx + 2 * K) ? (z - kz) % 3 === 1 : (x - kx) % 3 === 1)) id = B.GLASS_PANE;
      W.set(x, y, z, id);
    }
    if (!edge) { W.set(x, F - 1, z, B.SMOOTH_STONE); W.set(x, F + 5, z, B.SPRUCE_PLANKS); W.set(x, F + 10, z, B.SPRUCE_PLANKS); W.set(x, F + 15, z, S); }
    if (edge && (x + z) % 2 === 0) W.set(x, F + 16, z, S);
    if (edge) W.set(x, F + 15, z, S);
  }
  // keep door toward the gate, ladders, carpets, chests, lanterns
  const kd = [[0, -1], [1, 0], [0, 1], [-1, 0]][gate];
  const dxk = cx + kd[0] * K, dzk = cz + kd[1] * K;
  doorAt(W, dxk, F, dzk, [5, 0, 4, 1][gate]);
  for (let y = F; y <= F + 15; y++) W.set(kx + 1, y, kz + 1, B.LADDER, 0);
  for (let x = kx + 3; x <= kx + 2 * K - 3; x++) for (let z = kz + 3; z <= kz + 2 * K - 3; z++) W.set(x, F, z, B.WOOL + 14);
  W.set(kx + 2 * K - 1, F, kz + 2 * K - 1, B.CHEST, 1); W.loot(kx + 2 * K - 1, F, kz + 2 * K - 1, 'castle');
  W.set(kx + 2 * K - 1, F + 11, kz + 2 * K - 1, B.CHEST, 1); W.loot(kx + 2 * K - 1, F + 11, kz + 2 * K - 1, 'treasure');
  W.set(kx + 2 * K - 1, F + 6, kz + 1, B.BOOKSHELF); W.set(kx + 2 * K - 2, F + 6, kz + 1, B.BOOKSHELF); W.set(kx + 1, F + 6, kz + 2 * K - 1, B.BED, 0);
  for (const y of [F + 4, F + 9, F + 14]) W.set(cx, y, cz, B.LANTERN, 8);
  // banners: coloured wool hanging on the keep
  for (const [bx, bz] of [[cx - 2, kz - 1], [cx + 2, kz - 1], [cx - 2, kz + 2 * K + 1], [cx + 2, kz + 2 * K + 1]]) for (let y = F + 9; y <= F + 12; y++) W.set(bx, y, bz, B.WOOL + 14);
}
function y0Window(x, z, cx, cz) { return (x - cx + z - cz) % 4 === 0; }

// ---- mine ----
function planMine(g, cx, cz, rng) {
  const F = g.height(cx, cz) + 1;
  const Y = clamp(Math.floor(22 + rng() * 10), 16, F - 12);
  const plan = { type: 'mine', x: cx, z: cz, y: F, pieces: [], zones: [[cx - 4, cz - 4, cx + 4, cz + 4]], spawns: [], radius: 12, depth: Y };
  const segs = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const [dx, dz] = dirs[(i + Math.floor(rng() * 4)) % 4];
    const len = 22 + Math.floor(rng() * 34);
    segs.push({ x: cx, z: cz, dx, dz, len });
    const bt = 8 + Math.floor(rng() * (len - 10));
    if (rng() < 0.75) {
      const s = rng() < 0.5 ? 1 : -1;
      segs.push({ x: cx + dx * bt, z: cz + dz * bt, dx: dz * s, dz: dx * s, len: 14 + Math.floor(rng() * 22) });
    }
  }
  let x0 = cx - 4, z0 = cz - 4, x1 = cx + 4, z1 = cz + 4;
  for (const s of segs) { const ex = s.x + s.dx * s.len, ez = s.z + s.dz * s.len; x0 = Math.min(x0, ex - 2, s.x - 2); x1 = Math.max(x1, ex + 2, s.x + 2); z0 = Math.min(z0, ez - 2, s.z - 2); z1 = Math.max(z1, ez + 2, s.z + 2); }
  plan.pieces.push({ box: [x0, z0, x1, z1], build: (W) => buildMine(W, g, cx, cz, F, Y, segs) });
  return plan;
}
function buildMine(W, g, cx, cz, F, Y, segs) {
  // head frame over the shaft
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const x = cx + dx, z = cz + dz;
    if (!W.has(x, z)) continue;
    footing(W, g, x, z, F, B.COBBLE, F + 7);
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    W.set(x, F - 1, z, ring === 2 ? B.SPRUCE_PLANKS : B.AIR);
    if (ring === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) for (let y = F; y < F + 4; y++) W.set(x, y, z, B.SPRUCE_LOG);
    if (ring === 2 && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) W.set(x, F + 3, z, B.SPRUCE_PLANKS);
    // shaft lined with planks, ladder on the north wall
    for (let y = Y; y < F - 1; y++) {
      if (ring <= 1) W.set(x, y, z, B.AIR);
      else if (W.get(x, y, z) === B.AIR || IS_LIQUID(W.get(x, y, z))) W.set(x, y, z, B.SPRUCE_PLANKS);
    }
  }
  for (let y = Y; y <= F; y++) W.set(cx, y, cz - 1, B.LADDER, 4);
  roofPyramid(W, cx - 2, cz - 2, 5, F + 4, 'spruce');
  W.set(cx, F + 3, cz, B.LANTERN, 8);
  // tunnels: 3 wide, 3 tall, timber sets every 4 blocks
  const ores = [B.COAL_ORE, B.COAL_ORE, B.IRON_ORE, B.IRON_ORE, B.GOLD_ORE, B.EMERALD_ORE, B.DIAMOND_ORE];
  for (const s of segs) {
    for (let t = 0; t <= s.len; t++) {
      const x = s.x + s.dx * t, z = s.z + s.dz * t;
      for (let w = -1; w <= 1; w++) {
        const X = x + (s.dz ? w : 0), Z = z + (s.dx ? w : 0);
        if (!W.has(X, Z)) continue;
        for (let y = Y; y < Y + 3; y++) W.set(X, y, Z, B.AIR);
        if (W.get(X, Y - 1, Z) === B.AIR || IS_LIQUID(W.get(X, Y - 1, Z))) W.set(X, Y - 1, Z, B.SPRUCE_PLANKS);
        // ore in the walls now and then
        for (const side of [-2, 2]) {
          const OX = x + (s.dz ? side : 0), OZ = z + (s.dx ? side : 0);
          const r = hash3(OX, Y + 1, OZ, 4242);
          if (W.has(OX, OZ) && r < 0.06 && W.get(OX, Y + 1, OZ) === B.STONE) W.set(OX, Y + 1, OZ, ores[Math.floor(r / 0.06 * ores.length)]);
        }
        const web = hash3(X, Y + 2, Z, 777);
        if (web < 0.03 && w !== 0) W.set(X, Y + 2, Z, B.COBWEB);
      }
      if (t % 4 === 2) {
        for (const w of [-1, 1]) {
          const X = x + (s.dz ? w : 0), Z = z + (s.dx ? w : 0);
          W.set(X, Y, Z, B.SPRUCE_FENCE); W.set(X, Y + 1, Z, B.SPRUCE_FENCE);
        }
        for (let w = -1; w <= 1; w++) W.set(x + (s.dz ? w : 0), Y + 2, z + (s.dx ? w : 0), B.SPRUCE_PLANKS);
        if (t % 8 === 2) W.set(x, Y + 1, z, B.LANTERN, 8);
      }
      if (t === s.len && hash3(x, Y, z, 555) < 0.7) {
        const X = x + s.dx, Z = z + s.dz;
        W.set(X, Y, Z, B.CHEST, s.dx > 0 ? 1 : s.dx < 0 ? 0 : s.dz > 0 ? 5 : 4); W.loot(X, Y, Z, 'mine');
      }
    }
  }
}

// ---- port ----
function planPort(g, cx, cz, rng, seaDir) {
  const F = Math.max(SEA + 1, g.height(cx, cz) + 1);
  const st = VSTYLE[hash3(cx, 1, cz, g.seed) < 0.5 ? 'temperate' : 'tropical'];
  const plan = { type: 'port', x: cx, z: cz, y: F, pieces: [], zones: [], spawns: [], radius: 40 };
  const [sx, sz] = seaDir;
  const len = 18 + Math.floor(rng() * 12);
  // pier from the shore out to sea
  const p0 = [cx, cz];
  plan.zones.push([Math.min(cx, cx + sx * len) - 4, Math.min(cz, cz + sz * len) - 4, Math.max(cx, cx + sx * len) + 4, Math.max(cz, cz + sz * len) + 4]);
  plan.pieces.push({ box: plan.zones[0], build: (W) => buildPier(W, g, p0, seaDir, len, st) });
  // lighthouse at the end of a short jetty to one side
  const side = rng() < 0.5 ? 1 : -1;
  const lx = cx + sx * Math.floor(len * 0.6) + sz * side * 9, lz = cz + sz * Math.floor(len * 0.6) + sx * side * 9;
  plan.zones.push([lx - 3, lz - 3, lx + 3, lz + 3]);
  plan.pieces.push({ box: [lx - 3, lz - 3, lx + 3, lz + 3], build: (W) => buildLighthouse(W, g, lx, lz) });
  // houses along the shore, behind the pier
  const ax = sz, az = sx;   // along the coast
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const hx = cx - sx * 8 + ax * k * 9, hz = cz - sz * 8 + az * k * 9;
    const w = 5, d = 5;
    const x0 = hx - 2, z0 = hz - 2, x1 = x0 + w - 1, z1 = z0 + d - 1;
    let lo = 1e9, hi = -1e9;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const h = g.height(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (lo < SEA || hi - lo > 4) continue;
    plan.zones.push([x0, z0, x1, z1]);
    const HF = g.height(hx, hz) + 1, door = sx > 0 ? 0 : sx < 0 ? 1 : sz > 0 ? 4 : 5;
    const seed = hash3(x0, 3, z0, g.seed) * 1e6 | 0;
    plan.pieces.push({ box: [x0 - 2, z0 - 2, x1 + 2, z1 + 2], build: (W) => buildHouse(W, g, { x0, z0, x1, z1, F: HF, door, st, floors: 1, prof: 'fisher', seed }) });
    plan.spawns.push({ kind: 'villager', prof: 'fisher', x: hx + 0.5, y: HF, z: hz + 0.5 });
  }
  plan.spawns.push({ kind: 'villager', prof: 'fisher', x: cx + sx * (len - 2) + 0.5, y: F + 1, z: cz + sz * (len - 2) + 0.5 });
  plan.name = 'Port ' + villageName(cx, cz, g.seed).replace(/^(Sant|Santa) /, '');
  return plan;
}
function buildPier(W, g, p0, dir, len, st) {
  const [sx, sz] = dir, deck = SEA + 1;
  for (let t = -3; t <= len; t++) {
    const x = p0[0] + sx * t, z = p0[1] + sz * t;
    const wide = t >= len - 3 ? 3 : 1;
    for (let w = -wide; w <= wide; w++) {
      const X = x + sz * w, Z = z + sx * w;
      if (!W.has(X, Z)) continue;
      W.set(X, deck, Z, B.SPRUCE_PLANKS);
      for (let y = deck + 1; y < deck + 5; y++) W.set(X, y, Z, B.AIR);
      const edge = Math.abs(w) === wide;
      if (edge && t > 0 && t % 4 === 0) {
        for (let y = deck - 1; y > 0 && (W.get(X, y, Z) === B.WATER || W.get(X, y, Z) === B.AIR); y--) W.set(X, y, Z, B.SPRUCE_LOG);
        W.set(X, deck + 1, Z, B.SPRUCE_FENCE); W.set(X, deck + 2, Z, B.SPRUCE_FENCE); W.set(X, deck + 3, Z, B.LANTERN, 0);
      } else if (edge && t > 0) W.set(X, deck + 1, Z, B.SPRUCE_FENCE);
    }
    if (t === len - 1) { W.set(x + sz * 2, deck + 1, z + sx * 2, B.BARREL); W.loot(x + sz * 2, deck + 1, z + sx * 2, 'fish'); W.set(x - sz * 2, deck + 1, z - sx * 2, B.BARREL); }
  }
  void st;
}
function buildLighthouse(W, g, x, z) {
  const base = Math.max(SEA + 1, g.height(x, z) + 1), H = 20;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const X = x + dx, Z = z + dz;
    if (!W.has(X, Z)) continue;
    const r = Math.hypot(dx, dz);
    if (r > 3.3) continue;
    for (let y = Math.min(g.height(X, Z), base - 1); y < base; y++) if (y > 0) W.set(X, y, Z, B.STONE_BRICKS);
    for (let y = base; y < base + H + 8; y++) W.set(X, y, Z, B.AIR);
    if (r > 2.5) continue;
    for (let y = base; y < base + H; y++) {
      const shell = r > 1.5;
      const stripe = Math.floor((y - base) / 4) % 2 === 1;
      W.set(X, y, Z, shell ? (stripe ? B.WOOL + 14 : B.PLASTER) : B.AIR);
    }
    W.set(X, base + H, Z, B.STONE_BRICKS);
    if (r > 1.5) { W.set(X, base + H + 1, Z, B.GLASS_PANE); W.set(X, base + H + 2, Z, B.GLASS_PANE); }
  }
  for (let y = base; y < base + H; y++) W.set(x, y, z - 1, B.LADDER, 4);
  W.set(x, base + H + 1, z, B.GLOWSTONE); W.set(x, base + H + 2, z, B.GLOWSTONE);
  doorAt(W, x, base, z + 2, 4);
  roofPyramid(W, x - 2, z - 2, 5, base + H + 3, 'slate', B.LANTERN);
}

// ---- small structures ----
function planSmall(g, cx, cz, rng) {
  const F = g.height(cx, cz) + 1;
  const kind = rng() < 0.5 ? 'watchtower' : 'ruins';
  const plan = { type: kind, x: cx, z: cz, y: F, pieces: [], zones: [[cx - 5, cz - 5, cx + 5, cz + 5]], spawns: [], radius: 8 };
  if (kind === 'watchtower') plan.pieces.push({ box: [cx - 3, cz - 3, cx + 3, cz + 3], build: (W) => buildWatchtower(W, g, cx, cz, F) });
  else plan.pieces.push({ box: [cx - 5, cz - 5, cx + 5, cz + 5], build: (W) => buildRuins(W, g, cx, cz, F) });
  return plan;
}
function buildWatchtower(W, g, cx, cz, F) {
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const x = cx + dx, z = cz + dz;
    if (!W.has(x, z)) continue;
    footing(W, g, x, z, F, B.COBBLE, F + 18);
    const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
    if (corner) for (let y = F; y < F + 11; y++) W.set(x, y, z, B.SPRUCE_LOG);
    W.set(x, F + 10, z, B.SPRUCE_PLANKS);
    const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
    if (edge && !corner) W.set(x, F + 11, z, B.SPRUCE_FENCE);
    if (corner) { W.set(x, F + 11, z, B.SPRUCE_LOG); W.set(x, F + 12, z, B.SPRUCE_LOG); }
  }
  for (let y = F; y <= F + 10; y++) W.set(cx, y, cz, y === F + 10 ? B.AIR : B.SPRUCE_LOG);
  for (let y = F; y <= F + 10; y++) W.set(cx, y, cz - 1, B.LADDER, 4);
  roofPyramid(W, cx - 2, cz - 2, 5, F + 13, 'thatch');
  W.set(cx + 1, F + 11, cz + 1, B.CHEST, 5); W.loot(cx + 1, F + 11, cz + 1, 'tower');
  W.set(cx, F + 12, cz + 1, B.LANTERN, 8);
}
function buildRuins(W, g, cx, cz, F) {
  const arch = shapeId('cobble', 'arch');
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const x = cx + dx, z = cz + dz;
    if (!W.has(x, z)) continue;
    const h = g.height(x, z);
    const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4;
    const r = hash3(x, 3, z, 31337);
    if (!edge) { if (r < 0.35) W.set(x, h, z, r < 0.15 ? B.MOSSY_COBBLE : B.COBBLE); continue; }
    const tall = Math.floor(1 + hash3(x, 8, z, 4242) * 5);
    for (let y = h + 1; y <= h + tall; y++) W.set(x, y, z, hash3(x, y, z, 11) < 0.4 ? B.MOSSY_COBBLE : B.COBBLE);
    if (tall >= 4 && hash3(x, 9, z, 1) < 0.3) W.set(x, h + tall + 1, z, B.COBBLE_WALL);
  }
  // a standing archway
  const h0 = g.height(cx, cz - 4);
  for (let y = h0 + 1; y <= h0 + 2; y++) { W.set(cx, y, cz - 4, B.AIR); W.set(cx + 1, y, cz - 4, B.AIR); }
  W.set(cx, h0 + 3, cz - 4, arch, 1); W.set(cx + 1, h0 + 3, cz - 4, arch, 0);
  const hc = g.height(cx, cz);
  W.set(cx, hc + 1, cz, B.CHEST, 5); W.loot(cx, hc + 1, cz, 'ruins');
  W.set(cx + 2, hc + 1, cz - 1, B.COBWEB);
}

// ---- planning per cell ----
function regionNear(g, x, z, pad) {
  for (const r of g.regions) if (Math.hypot(x - r.x, z - r.z) < REGION_OUT + pad) return true;
  return false;
}

function planCell(g, ix, iz) {
  const seed = (g.seed ^ Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x5bd1e995) | 0;
  const rng = mulberry32(seed);
  const roll = rng();
  if (roll > 0.8) return null;
  const cx = ix * STRUCT_CELL + 70 + Math.floor(rng() * (STRUCT_CELL - 140));
  const cz = iz * STRUCT_CELL + 70 + Math.floor(rng() * (STRUCT_CELL - 140));
  if (regionNear(g, cx, cz, 90)) return null;
  const h = g.height(cx, cz);
  const { temp, hum } = g.climate(cx, cz);
  const biome = g.biome(h, temp, hum);
  // roughness around the centre
  let lo = h, hi = h;
  for (const [dx, dz] of [[12, 0], [-12, 0], [0, 12], [0, -12], [9, 9], [-9, -9], [9, -9], [-9, 9]]) { const hh = g.height(cx + dx, cz + dz); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
  // coast: sea within reach in one direction
  let seaDir = null;
  if (h >= SEA - 1 && h <= SEA + 4) {
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (g.height(cx + d[0] * 22, cz + d[1] * 22) < SEA - 3 && g.height(cx + d[0] * 34, cz + d[1] * 34) < SEA - 4) { seaDir = d; break; }
    }
  }
  const kind = rng();
  if (seaDir && kind < 0.75) return planPort(g, cx, cz, rng, seaDir);
  if (h < SEA + 1) return null;
  if (hi - lo <= 10 && h < SEA + 32 && kind < 0.7) {
    const style = biome === BIOME.DESERT ? 'desert' : biome === BIOME.SNOWY ? 'snowy' : biome === BIOME.FOREST ? 'forest' : temp > 0.25 && hum > 0 ? 'tropical' : 'temperate';
    return planVillage(g, cx, cz, rng, style);
  }
  if (h > SEA + 14 && kind < 0.4) return planCastle(g, cx, cz, rng);
  if (h > SEA + 10 && kind < 0.72) return planMine(g, cx, cz, rng);
  if (kind < 0.85) return planSmall(g, cx, cz, rng);
  return null;
}


// ---- village names ----
const VNAME_A = ['Vila', 'Riu', 'Mont', 'Pedra', 'Vall', 'Torre', 'Font', 'Castell', 'Coll', 'Pla', 'Mas', 'Cala', 'Roca', 'Serra', 'Prat', 'Puig'];
const VNAME_B = ['clara', 'nova', 'blanca', 'roja', 'seca', 'fosca', 'verda', 'daurada', 'alta', 'llarga', 'freda', 'bella', 'plana', 'grossa'];
const VNAME_SAINT = ['Pere', 'Joan', 'Martí', 'Jordi', 'Anna', 'Maria', 'Llúcia', 'Cugat', 'Feliu', 'Quirze', 'Esteve', 'Andreu'];
const VNAME_OF = ['de Mar', 'del Riu', 'del Bosc', 'de Dalt', 'de Baix', 'de la Serra', 'dels Pins', 'de les Fonts'];
function villageName(x, z, seed) {
  const r = mulberry32((seed ^ Math.imul(x, 668265263) ^ Math.imul(z, 374761393)) | 0);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const k = r();
  if (k < 0.3) { const s = pick(VNAME_SAINT); return (/a$/.test(s) ? 'Santa ' : 'Sant ') + s + (r() < 0.5 ? ' ' + pick(VNAME_OF) : ''); }
  if (k < 0.75) return pick(VNAME_A) + pick(VNAME_B);
  return pick(VNAME_A) + ' ' + pick(VNAME_OF);
}

// ---- the STUCOM village: the village nearest the origin, which new worlds start next to ----
// It gets the school (a replica of the STUCOM Centre d'Estudis on Carrer Pelai, Barcelona) and a
// couple of flat fenced plots kept free for the players to build on.
function stucomVillage(g) {
  if (g._stucom !== undefined || g._stucomBusy) return g._stucom || null;
  if (!g.structs || g.ver < 2 || g.type !== 'default') { g._stucom = null; return null; }
  g._stucomBusy = true;
  let best = null, bd = 1600;
  for (const p of structuresIn(g, -1600, -1600, 1600, 1600)) {
    const d = Math.hypot(p.x, p.z);
    if (p.type === 'village' && d < bd) { bd = d; best = p; }
  }
  g._stucomBusy = false;
  g._stucom = best;
  if (best && !best.stucom) decorateStucom(g, best);
  return best;
}

function decorateStucom(g, plan) {
  plan.stucom = true;
  plan.name = 'STUCOM';
  const st = VSTYLE[plan.style];
  const cx = plan.x, cz = plan.z;
  const W = 17, D = 13;
  const rough = (x0, z0, x1, z1) => {
    let lo = 1e9, hi = -1e9;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) >> 1, (z0 + z1) >> 1]]) {
      const h = g.height(x, z);
      if (h < SEA) return 99;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return hi - lo;
  };
  // the school faces the square from one of its four sides
  let site = null;
  for (const sz of [1, -1]) for (const dx of [-8, 6, -24]) {
    const x0 = cx + dx, zf = cz + sz * 6, zb = zf + sz * (D - 1);
    const r = rough(x0, Math.min(zf, zb), x0 + W - 1, Math.max(zf, zb));
    if (!site || r < site.r) site = { x0, zf, sz, r };
  }
  const { x0, zf, sz } = site;
  const rect = [x0 - 1, Math.min(zf, zf + sz * (D - 1)) - 1, x0 + W, Math.max(zf, zf + sz * (D - 1)) + 1];
  const hits = (b) => b[2] >= rect[0] && b[0] <= rect[2] && b[3] >= rect[1] && b[1] <= rect[3];
  // make room: whatever was planned there goes (roads stay, the square stays)
  plan.pieces = plan.pieces.filter((p, i) => i === 0 || !p.box || !hits(p.box) || (p.box[0] <= cx && p.box[2] >= cx && p.box[1] <= cz && p.box[3] >= cz));
  plan.zones.splice(0, plan.zones.length, ...plan.zones.filter((z) => !hits(z) || (z[0] <= cx && z[2] >= cx && z[1] <= cz && z[3] >= cz)));
  plan.spawns = plan.spawns.filter((s) => !(s.x >= rect[0] && s.x <= rect[2] + 1 && s.z >= rect[1] && s.z <= rect[3] + 1));
  plan.zones.push(rect);
  // keep trees off the forecourt so the entrance and the sign stay in view
  plan.zones.push(sz > 0 ? [x0 - 1, zf - 7, x0 + W, zf - 2] : [x0 - 1, zf + 2, x0 + W, zf + 7]);
  const F = g.height(x0 + (W >> 1), zf + sz * (D >> 1)) + 1;
  plan.pieces.push({ box: rect, build: (Wr) => buildSchool(Wr, g, x0, zf, sz, F, st) });
  plan.spawns.push({ kind: 'villager', prof: 'librarian', x: x0 + 4.5, y: F, z: zf + sz * 5 + 0.5 });
  plan.spawns.push({ kind: 'villager', prof: 'cleric', x: x0 + 12.5, y: F, z: zf + sz * 5 + 0.5 });
  // two free building plots on the other side of the square
  let placed = 0;
  const spots = [];
  for (let r = 14; r <= 70; r += 7) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2;
    spots.push([Math.round(cx + Math.cos(a) * r) - 7, Math.round(cz + Math.sin(a) * r) - 7]);
  }
  for (const [px0, pz0] of spots) {
    if (placed >= 2) break;
    const px1 = px0 + 13, pz1 = pz0 + 13;
    if (plan.zones.some((z) => px1 + 2 >= z[0] && px0 - 2 <= z[2] && pz1 + 2 >= z[1] && pz0 - 2 <= z[3])) continue;
    if (Math.abs(px0 + 7 - cx) < 3 || Math.abs(pz0 + 7 - cz) < 3) continue;   // not across a road
    if (rough(px0, pz0, px1, pz1) > 7) continue;
    plan.zones.push([px0, pz0, px1, pz1]);
    const PF = g.height((px0 + px1) >> 1, (pz0 + pz1) >> 1) + 1;
    plan.pieces.push({ box: [px0, pz0, px1, pz1], build: (Wr) => buildPlot(Wr, g, px0, pz0, px1, pz1, PF, st, (pz0 + pz1) / 2 < cz ? 1 : -1) });
    placed++;
  }
}

// A flat, fenced plot with lamps at the corners and a sign: room for the players' own builds.
function buildPlot(W, g, x0, z0, x1, z1, F, st, sz) {
  if (!rectHits(W, x0, z0, x1, z1)) return;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (!W.has(x, z)) continue;
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y < F - 1; y++) if (y > 0) W.set(x, y, z, B.DIRT);
    W.set(x, F - 1, z, B.GRASS);
    for (let y = F; y <= F + 14; y++) W.set(x, y, z, B.AIR);
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (corner) { W.set(x, F, z, st.fence); W.set(x, F + 1, z, st.fence); W.set(x, F + 2, z, B.LANTERN, 0); }
    else if (edge && (x + z) % 4 === 0) W.set(x, F, z, st.fence);
  }
  // sign on a post by the edge that faces the square
  const zs = sz > 0 ? z1 : z0, f = sz > 0 ? 4 : 5, mx = (x0 + x1) >> 1;
  W.set(mx, F, zs, B.PLASTER); W.set(mx + 1, F, zs, B.PLASTER);
  W.set(mx, F + 1, zs, B.PLASTER); W.set(mx + 1, F + 1, zs, B.PLASTER);
  W.pic(f === 4 ? mx : mx + 1, F, zs + (f === 4 ? 1 : -1), f, 2, 2, 'plot');
}

// The school: a Barcelona block front in stone and render, the arched entrance with the sign,
// four floors of classrooms behind balconies, a stair-and-ladder core and a roof terrace.
// Local frame: a (0..16) along the street, d (0..12) into the building; the front (d = 0) faces
// the square, i.e. towards -sz in z.
function buildSchool(W, g, x0, zf, sz, F, st) {
  const Wd = 17, D = 13, floors = [F, F + 6, F + 10, F + 14, F + 18], roof = F + 22;
  const Z = (d) => zf + sz * d;
  const set = (a, y, d, id, f) => W.set(x0 + a, y, Z(d), id, f);
  const zs = [Z(0), Z(D - 1)];
  if (!rectHits(W, x0 - 1, Math.min(...zs) - 2, x0 + Wd, Math.max(...zs) + 1)) return;
  const out = sz > 0 ? 5 : 4, inw = sz > 0 ? 4 : 5;          // facings towards the square / inside
  const stairs = shapeId('stone_brick', 'stairs');
  for (let a = -1; a <= Wd; a++) for (let d = -2; d <= D; d++) {
    const x = x0 + a, z = Z(d);
    if (!W.has(x, z)) continue;
    const inside = a >= 0 && a < Wd && d >= 0 && d < D;
    const h = g.height(x, z);
    if (inside) for (let y = Math.min(h, F - 3); y < F; y++) if (y > 0) W.set(x, y, z, B.STONE_BRICKS);
    for (let y = F; y <= roof + 4; y++) W.set(x, y, z, B.AIR);
    if (!inside) {
      // pavement in front of the school
      if (d < 0) { for (let y = Math.min(h, F - 2); y < F - 1; y++) if (y > 0) W.set(x, y, z, B.STONE_BRICKS); W.set(x, F - 1, z, B.SMOOTH_STONE); }
      continue;
    }
    const front = d === 0, back = d === D - 1, side = a === 0 || a === Wd - 1;
    W.set(x, F - 1, z, front || back || side ? B.STONE_BRICKS : B.SPRUCE_PLANKS);
    for (let y = F; y < roof; y++) {
      const fl = floors.filter((q) => q <= y).pop();
      let id = B.AIR;
      if (front) {
        if (y < F + 6) id = (y - F) % 2 ? B.SANDSTONE : B.PLASTER;                 // rusticated ground floor
        else if (y === fl) id = B.SANDSTONE;                                        // floor band
        else id = B.PLASTER;
      } else if (back || side) id = y === fl && y > F ? B.SANDSTONE : B.PLASTER;
      else if (y === fl && y > F) id = B.SPRUCE_PLANKS;                             // upper floors
      set(a, y, d, id);
    }
    // roof terrace with a parapet
    set(a, roof, d, B.SMOOTH_STONE);
    if (front || back || side) set(a, roof + 1, d, front ? B.IRON_BARS : B.PLASTER);
  }
  // cornice along the top of the front
  for (let a = -1; a <= Wd; a++) set(a, roof - 1, -1, shapeId('sandstone', 'stairs'), (sz > 0 ? 4 : 5) | 8);
  // ---- ground floor: the arched entrance with the sign above the doors ----
  for (let a = 5; a <= 11; a++) for (let y = F; y < F + 6; y++) set(a, y, 0, (a === 5 || a === 11) ? B.SANDSTONE : y < F + 3 ? B.AIR : B.PLASTER);
  set(5, F + 5, 0, shapeId('stone_brick', 'arch'), sz > 0 ? 1 : 0); set(11, F + 5, 0, shapeId('stone_brick', 'arch'), sz > 0 ? 0 : 1);
  for (let a = 6; a <= 10; a++) for (let d = 1; d <= 2; d++) { set(a, F - 1, d, B.SMOOTH_STONE); set(a, F + 3, d, B.PLASTER); }
  for (let a = 6; a <= 10; a++) set(a, F, 2, a === 8 ? B.DOOR : B.GLASS_PANE, out), set(a, F + 1, 2, a === 8 ? B.DOOR_TOP : B.GLASS_PANE, out), set(a, F + 2, 2, B.GLASS_PANE);
  // the sign: picture hung on the plaster above the doors, facing the square
  const n = sz > 0 ? [0, -1] : [0, 1];
  W.pic(sz > 0 ? x0 + 10 : x0 + 6, F + 3, Z(-1), out, 5, 3, 'stucom');
  void n;
  // ground-floor shop windows either side of the entrance
  for (const a0 of [1, 13]) for (let a = a0; a < a0 + 3; a++) for (let y = F + 1; y <= F + 3; y++) set(a, y, 0, B.GLASS_PANE);
  // ---- upper floors: tall windows with iron balconies ----
  const bays = [[2, 3], [6, 7], [9, 10], [13, 14]];
  for (const fl of floors.slice(1)) for (const [b0, b1] of bays) {
    for (let a = b0; a <= b1; a++) for (let y = fl + 1; y <= fl + 3; y++) set(a, y, 0, B.GLASS_PANE);
    set(b0 - 1, fl + 2, 0, B.SPRUCE_PLANKS); set(b1 + 1, fl + 2, 0, B.SPRUCE_PLANKS);   // shutters
    for (let a = b0 - 1; a <= b1 + 1; a++) { set(a, fl, -1, B.SANDSTONE_SLAB, 8); set(a, fl + 1, -1, B.IRON_BARS); }
  }
  // ---- inside ----
  // lobby: reception desk, benches, the school's sign picture, lamps
  for (let a = 2; a <= 5; a++) set(a, F, 5, B.SPRUCE_PLANKS);
  set(2, F + 1, 5, B.LANTERN, 0);
  for (let a = 11; a <= 14; a++) set(a, F, 8, shapeId('oak', 'stairs'), out);
  W.pic(sz > 0 ? x0 + 14 : x0 + 12, F + 2, Z(D - 2), out, 3, 2, 'sunset');
  for (const a of [4, 12]) set(a, F + 5, 6, B.LANTERN, 8);
  // classrooms: desks and chairs facing a whiteboard on the back wall
  for (const fl of floors.slice(1)) {
    for (let a = 4; a <= 12; a++) for (let y = fl + 1; y <= fl + 2; y++) set(a, y, D - 1, B.WOOL);   // whiteboard
    set(8, fl + 1, D - 3, B.SPRUCE_PLANKS); set(9, fl + 1, D - 3, B.SPRUCE_PLANKS);                // teacher's desk
    for (const d of [3, 5, 7]) for (const a of [3, 4, 7, 8, 11, 12]) {
      set(a, fl + 1, d + 1, B.PLANK_SLAB);                      // desk
      set(a, fl + 1, d, shapeId('oak', 'stairs'), out);         // chair, back to the windows
    }
    for (const a of [4, 8, 12]) set(a, fl + 3, 6, B.LANTERN, 8);
  }
  // stair core: a ladder in the back corner through every floor to the roof
  for (let y = F; y <= roof + 1; y++) set(1, y, D - 2, B.LADDER, out);
  for (let y = roof + 1; y <= roof + 3; y++) { set(0, y, D - 3, B.PLASTER); set(2, y, D - 3, B.PLASTER); set(1, y, D - 1, B.PLASTER); }
  set(1, roof + 4, D - 2, B.SMOOTH_STONE); set(0, roof + 4, D - 2, B.SMOOTH_STONE); set(2, roof + 4, D - 2, B.SMOOTH_STONE);
  void inw;
}

// Plans whose area may touch the rectangle.
function structuresIn(g, x0, z0, x1, z1) {
  if (!g.structs) return [];
  const out = [];
  const i0 = Math.floor((x0 - STRUCT_REACH) / STRUCT_CELL), i1 = Math.floor((x1 + STRUCT_REACH) / STRUCT_CELL);
  const j0 = Math.floor((z0 - STRUCT_REACH) / STRUCT_CELL), j1 = Math.floor((z1 + STRUCT_REACH) / STRUCT_CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const key = i * 65536 + j;
    let p = g.structs.get(key);
    if (p === undefined) { p = planCell(g, i, j); g.structs.set(key, p); }
    if (p) out.push(p);
  }
  // the STUCOM village is decided (and gets its school) before anything is built
  if (g._stucom === undefined && !g._stucomBusy) stucomVillage(g);
  return out;
}

// Inside a building, road or square (no trees there).
function structZone(g, x, z) {
  for (const p of structuresIn(g, x, z, x, z)) for (const r of p.zones) if (x >= r[0] - 1 && x <= r[2] + 1 && z >= r[1] - 1 && z <= r[3] + 1) return true;
  return false;
}

function placeStructures(g, chunk) {
  const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
  const plans = structuresIn(g, x0, z0, x0 + CS - 1, z0 + CS - 1);
  if (!plans.length) return;
  const W = structWriter(chunk);
  for (const p of plans) for (const piece of p.pieces) {
    const b = piece.box;
    if (b[2] < W.x0 - 3 || b[0] > W.x1 + 3 || b[3] < W.z0 - 3 || b[1] > W.z1 + 3) continue;
    piece.build(W);
  }
}
