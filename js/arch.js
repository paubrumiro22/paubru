'use strict';
// Architecture: shaped blocks in many materials (stairs, true sloped roofs with outer and inner
// corners, vertical panels, columns with base and capital, quarter arches), connecting blocks
// (fences, walls, glass panes, iron bars), lanterns and a few new materials (plaster, marble,
// clay roof tiles, slate, thatch). Geometry lives here so the mesher, collisions, ray picking,
// icons and held items all agree on it.
//
// Orientation: a shaped block stores a facing f in world.facing (0 +X, 1 -X, 4 +Z, 5 -Z) = the
// side its high / back part is on. Bit 8 flips it upside down (ceilings, eaves, top slabs).
// Shapes are described in a canonical frame with the back at -Z and rotated into place.

// ---- new plain blocks ----
Object.assign(B, {
  PLASTER: 119, MARBLE: 120, ROOF_TILES: 121, SLATE: 122, THATCH: 123, DIRT_PATH: 124, LANTERN: 125, BARREL: 126,
  ARCH_TABLE: 127, COBWEB: 128, OAK_FENCE: 129, SPRUCE_FENCE: 130, COBBLE_WALL: 131, STONE_BRICK_WALL: 132,
  GLASS_PANE: 133, IRON_BARS: 134, ENCHANT_TABLE: 135, BREWING_STAND: 136, EMERALD_ORE: 137, EMERALD_BLOCK: 138, SOLAR_PANEL: 139,
  SHAPE0: 140,
});

const RT_SHAPE = 15, RT_CONNECT = 16, RT_LANTERN = 17;
const SH_STAIRS = 1, SH_SLOPE = 2, SH_OUTER = 3, SH_INNER = 4, SH_PANEL = 5, SH_PILLAR = 6, SH_ARCH = 7;
const CN_FENCE = 1, CN_WALL = 2, CN_PANE = 3;
const BLOCK_SHAPE = new Uint8Array(256);    // shape kind of a shaped block
const BLOCK_SHAPE_MAT = new Uint8Array(256); // index into ARCH_MATS
const BLOCK_CONNECT = new Uint8Array(256);   // connecting kind (fence, wall, pane)

// valid stored facings: 0 1 4 5, plus 8 for upside down
const FACINGS = [0, 1, 4, 5, 8, 9, 12, 13];
function validFacing(f) { return FACINGS.includes(f); }

const PLASTER_OPT = { hard: 1.2, tool: TOOL_PICK, snd: SND.STONE, blast: 5, cat: 'architecture' };
defBlock(B.PLASTER, 'Plaster', RT_CUBE, 'plaster', PLASTER_OPT);
defBlock(B.MARBLE, 'Marble', RT_CUBE, 'marble', with_(ROCK, { hard: 1.8, cat: 'architecture' }));
defBlock(B.ROOF_TILES, 'Clay Roof Tiles', RT_CUBE, 'roof_tiles', with_(ROCK, { hard: 1.2, cat: 'architecture' }));
defBlock(B.SLATE, 'Slate', RT_CUBE, 'slate', with_(ROCK, { hard: 1.5, cat: 'architecture' }));
defBlock(B.THATCH, 'Thatch', RT_CUBE, 'thatch', { hard: 0.5, tool: TOOL_HOE, snd: SND.GRASS, cat: 'architecture' });
defBlock(B.DIRT_PATH, 'Dirt Path', RT_FARMLAND, ['dirt_path', 'dirt', 'dirt_path_side'], { atten: 1, hard: 0.6, tool: TOOL_SHOVEL, snd: SND.DIRT, cat: 'nature' });
defBlock(B.LANTERN, 'Lantern', RT_LANTERN, { top: 'lantern_top', side: 'lantern' }, { emit: 15, atten: 0, hard: 0.5, tool: TOOL_PICK, snd: SND.METAL, solid: false, cat: 'functional' });
defBlock(B.BARREL, 'Barrel', RT_CUBE, { top: 'barrel_top', bottom: 'barrel_top', side: 'barrel_side' }, with_(WOOD, { hard: 2.5, cat: 'functional' }));
defBlock(B.ARCH_TABLE, "Architect's Table", RT_CUBE, { top: 'arch_table_top', bottom: 'planks', side: 'arch_table_side' }, with_(WOOD, { hard: 2.5, cat: 'functional' }));
defBlock(B.COBWEB, 'Cobweb', RT_CROSS, 'cobweb', { atten: 1, hard: 4, tool: TOOL_SWORD, snd: SND.WOOL, flags: FLAG_TRANSLUCENT, solid: false, cat: 'nature' });
defBlock(B.EMERALD_ORE, 'Emerald Ore', RT_CUBE, 'emerald_ore', with_(ROCK, { hard: 3, tier: 3, cat: 'nature' }));
defBlock(B.SOLAR_PANEL, 'Solar Panel', RT_CUBE, { top: 'solar_panel', bottom: 'smooth_stone', side: 'smooth_stone' }, with_(ROCK, { hard: 1.5, snd: SND.GLASS, cat: 'architecture' }));
defBlock(B.EMERALD_BLOCK, 'Block of Emerald', RT_CUBE, 'emerald_block', with_(ROCK, { hard: 5, tier: 3, snd: SND.METAL }));

// connecting blocks
function defConnect(id, name, kind, tex, o) {
  defBlock(id, name, RT_CONNECT, tex, Object.assign({ atten: 0, cat: 'architecture' }, o, { solid: true }));
  BLOCK_CONNECT[id] = kind;
  BLOCK_HEIGHT[id] = kind === CN_PANE ? 16 : 24;
}
defConnect(B.OAK_FENCE, 'Oak Fence', CN_FENCE, 'planks', WOOD);
defConnect(B.SPRUCE_FENCE, 'Spruce Fence', CN_FENCE, 'spruce_planks', WOOD);
defConnect(B.COBBLE_WALL, 'Cobblestone Wall', CN_WALL, 'cobble', with_(ROCK, { hard: 2 }));
defConnect(B.STONE_BRICK_WALL, 'Stone Brick Wall', CN_WALL, 'stone_bricks', ROCK);
defConnect(B.GLASS_PANE, 'Glass Pane', CN_PANE, 'glass', { hard: 0.3, snd: SND.GLASS, flags: FLAG_TRANSLUCENT });
defConnect(B.IRON_BARS, 'Iron Bars', CN_PANE, 'iron_bars', { hard: 5, tool: TOOL_PICK, tier: 1, snd: SND.METAL });
BLOCK_SOLID[B.LANTERN] = 1; BLOCK_HEIGHT[B.LANTERN] = 9;

// ---- shaped blocks: every material gets the roof and wall shapes; masonry and wood also get
// columns and arches ----
const ARCH_MATS = [
  { key: 'oak', name: 'Oak', tex: 'planks', src: B.PLANKS, o: WOOD, pillar: true },
  { key: 'spruce', name: 'Spruce', tex: 'spruce_planks', src: B.SPRUCE_PLANKS, o: WOOD, pillar: true },
  { key: 'birch', name: 'Birch', tex: 'birch_planks', src: B.BIRCH_PLANKS, o: WOOD, pillar: false },
  { key: 'cobble', name: 'Cobblestone', tex: 'cobble', src: B.COBBLE, o: with_(ROCK, { hard: 2 }), pillar: true },
  { key: 'stone_brick', name: 'Stone Brick', tex: 'stone_bricks', src: B.STONE_BRICKS, o: ROCK, pillar: true },
  { key: 'brick', name: 'Brick', tex: 'bricks', src: B.BRICKS, o: with_(ROCK, { hard: 2 }), pillar: true },
  { key: 'sandstone', name: 'Sandstone', tex: ['sandstone_top', 'sandstone_bottom', 'sandstone_side'], src: B.SANDSTONE, o: with_(ROCK, { hard: 0.8 }), pillar: true },
  { key: 'plaster', name: 'Plaster', tex: 'plaster', src: B.PLASTER, o: PLASTER_OPT, pillar: true },
  { key: 'marble', name: 'Marble', tex: 'marble', src: B.MARBLE, o: with_(ROCK, { hard: 1.8 }), pillar: true },
  { key: 'tiles', name: 'Clay Tile', tex: 'roof_tiles', src: B.ROOF_TILES, o: with_(ROCK, { hard: 1.2 }), pillar: false },
  { key: 'slate', name: 'Slate', tex: 'slate', src: B.SLATE, o: with_(ROCK, { hard: 1.5 }), pillar: false },
  { key: 'thatch', name: 'Thatch', tex: 'thatch', src: B.THATCH, o: { hard: 0.5, tool: TOOL_HOE, snd: SND.GRASS }, pillar: false },
];
const SHAPE_KINDS = [
  { kind: SH_STAIRS, key: 'stairs', name: 'Stairs', atten: 15, yield: 1 },
  { kind: SH_SLOPE, key: 'slope', name: 'Roof Slope', atten: 15, yield: 1 },
  { kind: SH_OUTER, key: 'outer', name: 'Roof Outer Corner', atten: 15, yield: 1 },
  { kind: SH_INNER, key: 'inner', name: 'Roof Inner Corner', atten: 15, yield: 1 },
  { kind: SH_PANEL, key: 'panel', name: 'Wall Panel', atten: 1, yield: 2 },
  { kind: SH_PILLAR, key: 'pillar', name: 'Column', atten: 1, yield: 1, pillarOnly: true },
  { kind: SH_ARCH, key: 'arch', name: 'Arch', atten: 1, yield: 1, pillarOnly: true },
];
const SHAPE_OF = {};   // `${matKey}:${shapeKey}` -> block id
{
  let id = B.SHAPE0;
  ARCH_MATS.forEach((m, mi) => {
    for (const s of SHAPE_KINDS) {
      if (s.pillarOnly && !m.pillar) continue;
      defBlock(id, m.name + ' ' + s.name, RT_SHAPE, m.tex, Object.assign({}, m.o, { atten: s.atten, solid: true, cat: 'architecture' }));
      BLOCK_SHAPE[id] = s.kind;
      BLOCK_SHAPE_MAT[id] = mi;
      BLOCK_HEIGHT[id] = 16;
      SHAPE_OF[m.key + ':' + s.key] = id;
      id++;
    }
  });
  B.SHAPE_END = id;
}
function shapeId(mat, shape) { return SHAPE_OF[mat + ':' + shape] || 0; }
for (let id = 0; id < 256; id++) if (BLOCK_SHAPE[id] || id === B.LANTERN) FACING_BLOCKS.add(id);

// ---- geometry ----
// Rotate / flip a canonical point (1/16 units, back at -Z) into facing f.
function shapeXf(f, x, y, z) {
  if (f & 8) y = 16 - y;
  switch (f & 7) {
    case 4: return [16 - x, y, 16 - z];
    case 0: return [16 - z, y, x];
    case 1: return [z, y, 16 - x];
    default: return [x, y, z];
  }
}
function shapeXfN(f, nx, ny, nz) {
  if (f & 8) ny = -ny;
  switch (f & 7) {
    case 4: return [-nx, ny, -nz];
    case 0: return [-nz, ny, nx];
    case 1: return [nz, ny, -nx];
    default: return [nx, ny, nz];
  }
}
function xfBox(f, b) {
  const a = shapeXf(f, b[0], b[1], b[2]), c = shapeXf(f, b[3], b[4], b[5]);
  return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])];
}

function archSlices() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const dz = 16 - (2 * i + 1), R = 14;
    const y0 = dz >= R ? 0 : Math.round(Math.sqrt(R * R - dz * dz));
    out.push([0, y0, 2 * i, 16, 16, 2 * i + 2]);
  }
  return out;
}
const SLOPE_STEPS = [0, 1, 2, 3].map((k) => [0, 0, 4 * k, 16, 16 - 4 * k, 4 * k + 4]);
const SLOPE_STEPS_X = [0, 1, 2, 3].map((k) => [4 * k, 0, 0, 4 * k + 4, 16 - 4 * k, 16]);
const OUTER_STEPS = [0, 1, 2, 3].map((k) => [0, 0, 0, 16 - 4 * k, 4 * k + 4, 16 - 4 * k]);

// Canonical description of each shape: render boxes, slanted polygons, collision boxes.
// poly: { p: [[x,y,z]...], n: [nx,ny,nz], slant } — slant polygons get a sloped normal.
const SHAPE_CANON = {
  [SH_STAIRS]: { boxes: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 16, 16, 8]] },
  [SH_PANEL]: { boxes: [[0, 0, 0, 16, 16, 8]] },
  [SH_ARCH]: { boxes: archSlices() },
  [SH_PILLAR]: { boxes: [[3, 0, 3, 13, 16, 13]] },
  [SH_SLOPE]: {
    polys: [
      { p: [[0, 0, 16], [16, 0, 16], [16, 0, 0], [0, 0, 0]], n: [0, -1, 0] },
      { p: [[16, 0, 0], [16, 16, 0], [0, 16, 0], [0, 0, 0]], n: [0, 0, -1] },
      { p: [[0, 16, 0], [16, 16, 0], [16, 0, 16], [0, 0, 16]], n: [0, 1, 1], slant: true },
      { p: [[0, 0, 0], [0, 16, 0], [0, 0, 16]], n: [-1, 0, 0] },
      { p: [[16, 0, 16], [16, 16, 0], [16, 0, 0]], n: [1, 0, 0] },
    ],
    coll: SLOPE_STEPS,
  },
  [SH_OUTER]: {
    polys: [
      { p: [[0, 0, 16], [16, 0, 16], [16, 0, 0], [0, 0, 0]], n: [0, -1, 0] },
      { p: [[16, 0, 0], [0, 16, 0], [0, 0, 0]], n: [0, 0, -1] },
      { p: [[0, 0, 0], [0, 16, 0], [0, 0, 16]], n: [-1, 0, 0] },
      { p: [[0, 16, 0], [16, 0, 16], [0, 0, 16]], n: [0, 1, 1], slant: true },
      { p: [[0, 16, 0], [16, 0, 0], [16, 0, 16]], n: [1, 1, 0], slant: true },
    ],
    coll: OUTER_STEPS,
  },
  [SH_INNER]: {
    polys: [
      { p: [[0, 0, 16], [16, 0, 16], [16, 0, 0], [0, 0, 0]], n: [0, -1, 0] },
      { p: [[16, 0, 0], [16, 16, 0], [0, 16, 0], [0, 0, 0]], n: [0, 0, -1] },
      { p: [[0, 0, 0], [0, 16, 0], [0, 16, 16], [0, 0, 16]], n: [-1, 0, 0] },
      { p: [[16, 0, 16], [16, 16, 0], [16, 0, 0]], n: [1, 0, 0] },
      { p: [[0, 0, 16], [0, 16, 16], [16, 0, 16]], n: [0, 0, 1] },
      { p: [[0, 16, 0], [0, 16, 16], [16, 0, 16]], n: [1, 1, 0], slant: true },
      { p: [[0, 16, 0], [16, 0, 16], [16, 16, 0]], n: [0, 1, 1], slant: true },
    ],
    coll: [...SLOPE_STEPS, ...SLOPE_STEPS_X],
  },
};

// Sloped normals are sent to the shader as a code 1..8: (dir 0 +X, 1 -X, 2 +Z, 3 -Z) * 2 + down.
function slopeCode(n) {
  const dir = n[0] > 0.5 ? 0 : n[0] < -0.5 ? 1 : n[2] > 0.5 ? 2 : 3;
  return 1 + dir * 2 + (n[1] < 0 ? 1 : 0);
}

const _shapeCache = new Map();
// Oriented geometry of a shape: { boxes, polys: [{ p, n, slant, code, uv }], coll } (1/16 units).
function shapeGeom(kind, f) {
  const key = kind * 16 + (f & 15);
  let g = _shapeCache.get(key);
  if (g) return g;
  const c = SHAPE_CANON[kind];
  g = { boxes: (c.boxes || []).map((b) => xfBox(f, b)), polys: [], coll: null };
  for (const q of c.polys || []) {
    const pts = q.p.map((p) => shapeXf(f, p[0], p[1], p[2]));
    const n = shapeXfN(f, q.n[0], q.n[1], q.n[2]);
    // texture coordinates: slants run from the ridge (v 0) down the slope; flat faces use the world frame
    let uv = null;
    if (q.slant) uv = q.p.map((p) => (q.n[0] ? [p[2] / 16, p[0] / 16] : [p[0] / 16, p[2] / 16]));
    g.polys.push({ p: pts, n, slant: !!q.slant, code: q.slant ? slopeCode(n) : 0, uv });
  }
  g.coll = (c.coll || c.boxes).map((b) => xfBox(f, b));
  _shapeCache.set(key, g);
  return g;
}

// Pillar parts depend on the blocks above and below (base and capital where the column ends).
function pillarBoxes(below, above) {
  const out = [[3, 0, 3, 13, 16, 13]];
  if (!below) out.push([1, 0, 1, 15, 3, 15]);
  if (!above) out.push([1, 13, 1, 15, 16, 15]);
  return out;
}

// Connecting blocks: which of +X -X +Z -Z they join.
function connectsTo(kind, nb) {
  if (!nb) return false;
  const k = BLOCK_CONNECT[nb];
  if (k) return k === kind;
  return !!BLOCK_OPAQUE[nb];
}
// Boxes (1/16) of a connecting block given its four neighbours; tall=true adds the 1.5 block
// collision height of fences and walls.
function connectBoxes(kind, px, nx, pz, nz, tall) {
  const H = tall && kind !== CN_PANE ? 24 : 16;
  const out = [];
  if (kind === CN_FENCE) {
    out.push([6, 0, 6, 10, tall ? H : 16, 10]);
    const rail = (b) => { if (tall) out.push([b[0], 0, b[2], b[3], H, b[5]]); else { out.push([b[0], 6, b[2], b[3], 9, b[5]]); out.push([b[0], 12, b[2], b[3], 15, b[5]]); } };
    if (px) rail([10, 0, 7, 16, 0, 9]);
    if (nx) rail([0, 0, 7, 6, 0, 9]);
    if (pz) rail([7, 0, 10, 9, 0, 16]);
    if (nz) rail([7, 0, 0, 9, 0, 6]);
  } else if (kind === CN_WALL) {
    const straightX = px && nx && !pz && !nz, straightZ = pz && nz && !px && !nx;
    const top = tall ? H : 13;
    if (straightX) out.push([0, 0, 5, 16, top, 11]);
    else if (straightZ) out.push([5, 0, 0, 11, top, 16]);
    else {
      out.push([4, 0, 4, 12, tall ? H : 16, 12]);
      if (px) out.push([12, 0, 5, 16, top, 11]);
      if (nx) out.push([0, 0, 5, 4, top, 11]);
      if (pz) out.push([5, 0, 12, 11, top, 16]);
      if (nz) out.push([5, 0, 0, 11, top, 4]);
    }
  } else {
    out.push([7, 0, 7, 9, 16, 9]);
    if (px) out.push([9, 0, 7, 16, 16, 9]);
    if (nx) out.push([0, 0, 7, 7, 16, 9]);
    if (pz) out.push([7, 0, 9, 9, 16, 16]);
    if (nz) out.push([7, 0, 0, 9, 16, 7]);
    if (!px && !nx && !pz && !nz) { out.push([0, 0, 7, 16, 16, 9]); }
  }
  return out;
}

function lanternBoxes(hanging) {
  return hanging
    ? [[5, 1, 5, 11, 8, 11], [6, 8, 6, 10, 10, 10], [7, 10, 7, 9, 16, 9]]
    : [[5, 0, 5, 11, 7, 11], [6, 7, 6, 10, 9, 10]];
}

// Collision / picking boxes of any cell in block units, or null for plain full-height blocks.
// get(dx, dy, dz) returns the neighbouring block id; facing is the stored orientation.
function specialBoxes(id, facing, get, tall) {
  const rt = BLOCK_RT[id];
  if (rt === RT_SHAPE) {
    const k = BLOCK_SHAPE[id];
    if (k === SH_PILLAR) return pillarBoxes(get(0, -1, 0) === id, get(0, 1, 0) === id).slice(0, 1).map(div16);
    return shapeGeom(k, facing).coll.map(div16);
  }
  if (rt === RT_CONNECT) {
    const kd = BLOCK_CONNECT[id];
    return connectBoxes(kd, connectsTo(kd, get(1, 0, 0)), connectsTo(kd, get(-1, 0, 0)), connectsTo(kd, get(0, 0, 1)), connectsTo(kd, get(0, 0, -1)), tall).map(div16);
  }
  if (rt === RT_LANTERN) return [lanternBoxes(facing & 8)[0]].map(div16);
  if (rt === RT_SLAB && (facing & 8)) return [[0, 0.5, 0, 1, 1, 1]];
  return null;
}
function div16(b) { return [b[0] / 16, b[1] / 16, b[2] / 16, b[3] / 16, b[4] / 16, b[5] / 16]; }
