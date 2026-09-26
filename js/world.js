'use strict';
// Chunk storage, terrain generation (biomes, caves, lava, ores, trees, plants), block facing,
// block entities (chests, furnaces) and player edits.

const CS = 16;          // chunk width/depth
const CH = 128;         // world height
const SEA = 52;         // sea level (top water block y)
const CAVE_STEP = 4;    // cave noise sampled every 4 blocks, trilinear in between
const LAVA_Y = 10;      // carved cave space at or below this level fills with lava
const FLAT_Y = 50;      // grass level of flat worlds

function chunkKey(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
function blockIndex(x, y, z) { return (y * CS + z) * CS + x; }
function posKey(x, y, z) { return ((x + 1048576) * 2097152 + (z + 1048576)) * 128 + y; }
function keyPos(k) {
  const y = k % 128, r = (k - y) / 128;
  const z = (r % 2097152) - 1048576, x = Math.floor(r / 2097152) - 1048576;
  return [x, y, z];
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint16Array(CS * CS * CH);
    this.heightmap = new Uint8Array(CS * CS);     // highest non-air y per column
    this.grassTint = new Uint8Array(CS * CS * 3);
    this.foliageTint = new Uint8Array(CS * CS * 3);
    this.waterTint = new Uint8Array(CS * CS * 4);  // water scatter colour ×1000 and murkiness ×255
    this.light = null;        // sky<<4 | block light, filled by the mesher
    this.maxY = 0;
    this.mesh = null;         // GPU buffers, owned by the renderer
    this.needsMesh = true;
    this.meshVersion = 0;
    this.gfacing = null;      // posKey -> facing of generated shaped blocks (structures)
    this.gloot = null;        // posKey -> loot table of generated chests
    this.gpics = null;        // pictures hung by structures: [{ x, y, z, f, w, h, builtin }]
  }
  get(x, y, z) { return this.blocks[(y * CS + z) * CS + x]; }
  recomputeHeight(x, z) {
    let y = CH - 1;
    const b = this.blocks;
    while (y > 0 && b[(y * CS + z) * CS + x] === 0) y--;
    this.heightmap[z * CS + x] = y;
    if (y > this.maxY) this.maxY = y;
  }
}

const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6 };

// Water looks: [scatter r, g, b, murkiness 0..1]. The scatter colour is what the water glows with
// in daylight; murkiness raises how fast light dies in green and blue (clear tropical water lets
// the sand show through deep down, a forest pond turns olive a hand below the surface).
const WATER_STYLE = {
  ocean: [0.010, 0.058, 0.105, 0.14],
  deep: [0.005, 0.030, 0.092, 0.10],
  tropic: [0.020, 0.150, 0.132, 0.0],
  lagoon: [0.034, 0.175, 0.150, 0.0],
  cold: [0.010, 0.052, 0.078, 0.22],
  river: [0.016, 0.088, 0.068, 0.36],
  forest: [0.024, 0.066, 0.036, 0.62],
  glacier: [0.036, 0.130, 0.150, 0.05],
  muddy: [0.046, 0.052, 0.028, 0.8],
  oasis: [0.018, 0.130, 0.120, 0.08],
};
function mixWater(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; }
function storeWater(chunk, i, w) {
  const o = i * 4;
  chunk.waterTint[o] = clamp(Math.round(w[0] * 1000), 0, 255);
  chunk.waterTint[o + 1] = clamp(Math.round(w[1] * 1000), 0, 255);
  chunk.waterTint[o + 2] = clamp(Math.round(w[2] * 1000), 0, 255);
  chunk.waterTint[o + 3] = clamp(Math.round(w[3] * 255), 0, 255);
}

class WorldGen {
  // ver: generator version. 1 = worlds from before rivers and structures (kept identical so
  // saved builds do not end up inside a new village); 2 adds rivers, villages, castles, mines...
  constructor(seed, type, ver = 1) {
    this.seed = seed | 0;
    this.ver = ver;
    this.preset = WORLD_PRESETS[type] || null;
    this.type = this.preset || type === 'flat' ? type : 'default';
    const s = this.seed;
    this.nCont = new SimplexNoise(s + 11);
    this.nEro = new SimplexNoise(s + 23);
    this.nPeak = new SimplexNoise(s + 37);
    this.nHill = new SimplexNoise(s + 41);
    this.nDet = new SimplexNoise(s + 53);
    this.nTemp = new SimplexNoise(s + 67);
    this.nHum = new SimplexNoise(s + 79);
    this.nCaveA = new SimplexNoise(s + 97);
    this.nCaveB = new SimplexNoise(s + 101);
    this.nCaveC = new SimplexNoise(s + 113);
    this.nPatch = new SimplexNoise(s + 131);
    this.nRiver = new SimplexNoise(s + 149);
    // themed places scattered through the regular world (see presets.js)
    this.regions = this.type === 'default' ? placeRegions(this.seed) : [];
    this.structs = this.ver >= 2 && this.type === 'default' ? new Map() : null;   // cell -> plan (structures.js)
  }

  // 0..1: how much of a river channel this column is (rivers wind through the lowlands and fade
  // out as the ground climbs into the mountains, where they start).
  riverAt(x, z) {
    if (this.ver < 2 || this.type !== 'default') return 0;
    const n = this.nRiver.fbm2(x * 0.0019, z * 0.0019, 3);
    const w = 0.026 + 0.012 * this.nRiver.noise2D(x * 0.004 + 50, z * 0.004);
    return smoothstep(w * 2.6, w * 0.55, Math.abs(n));
  }

  height(x, z) {
    if (this.preset) return this.preset.height(this, x, z);
    if (this.type === 'flat') return FLAT_Y;
    const base = this.baseHeight(x, z);
    const R = regionBlend(this, x, z);
    if (!R) return base;
    const hp = R.r.p.height(this, x - R.r.x, z - R.r.z);
    return Math.floor(hp + (base - hp) * R.t);
  }

  // The owner of a column: a themed place (with local coordinates) or null for the default rules.
  regionOwner(x, z) {
    if (this.preset) return { p: this.preset, x: 0, z: 0, t: 0 };
    if (!this.regions.length) return null;
    const R = regionBlend(this, x, z);
    if (!R) return null;
    // the handover line wobbles so the border between the two looks natural
    if (R.t > 0.5 + this.nDet.noise2D(x * 0.05, z * 0.05) * 0.18) return null;
    return { p: R.r.p, x: R.r.x, z: R.r.z, t: R.t };
  }

  baseHeight(x, z) {
    const c = this.nCont.fbm2(x * 0.0016, z * 0.0016, 4);
    const e = this.nEro.fbm2(x * 0.0028, z * 0.0028, 3);
    const ridge = 1 - Math.abs(this.nPeak.fbm2(x * 0.0042, z * 0.0042, 4));
    const land = smoothstep(-0.28, 0.08, c);
    let h = SEA - 20 + land * 23 + c * 9;
    h += this.nDet.fbm2(x * 0.03, z * 0.03, 3) * (1.5 + 2.5 * land);
    h += this.nHill.fbm2(x * 0.009, z * 0.009, 3) * 9 * land;
    const mountain = smoothstep(0.02, 0.42, c) * smoothstep(0.35, -0.25, e);
    h += Math.pow(ridge, 2.6) * 62 * mountain;
    const rv = this.riverAt(x, z);
    if (rv > 0 && h > SEA - 3) {
      const lowland = 1 - smoothstep(SEA + 20, SEA + 44, h);
      const bed = SEA - 1 - rv * 3.2;
      h += (bed - h) * rv * lowland;
    }
    return Math.max(6, Math.min(CH - 10, Math.floor(h)));
  }

  climate(x, z) {
    if (this.type === 'flat') return { temp: 0.05, hum: 0 };
    return {
      temp: this.nTemp.fbm2(x * 0.0011, z * 0.0011, 3),
      hum: this.nHum.fbm2(x * 0.0014 + 100, z * 0.0014 - 100, 3),
    };
  }

  biome(h, temp, hum) {
    if (this.preset) return BIOME.PLAINS;
    if (this.type === 'flat') return BIOME.PLAINS;
    if (h < SEA - 2) return BIOME.OCEAN;
    if (h >= SEA + 34) return BIOME.MOUNTAIN;
    if (temp < -0.22) return BIOME.SNOWY;
    if (h <= SEA + 1) return BIOME.BEACH;
    if (temp > 0.2 && hum < 0.05) return BIOME.DESERT;
    if (hum > 0.06) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  // Raw cave noise at a lattice point (world coords multiple of CAVE_STEP).
  caveSample(x, y, z) {
    const a = this.nCaveA.noise3D(x * 0.018, y * 0.026, z * 0.018);
    const b = this.nCaveB.noise3D(x * 0.018 + 50, y * 0.026, z * 0.018 - 50);
    const c = this.nCaveC.noise3D(x * 0.011, y * 0.017, z * 0.011);
    // worm tunnels where both a and b are near zero; caverns where c is high
    const worm = a * a + b * b;
    const cavern = c - 0.62;
    return Math.min(worm - 0.012, -cavern * 0.1);   // < 0 means carved
  }

  // Same interpolation the chunk generator uses, for arbitrary positions (tree checks).
  caveAt(x, y, z) {
    const x0 = Math.floor(x / CAVE_STEP) * CAVE_STEP, y0 = Math.floor(y / CAVE_STEP) * CAVE_STEP, z0 = Math.floor(z / CAVE_STEP) * CAVE_STEP;
    const tx = (x - x0) / CAVE_STEP, ty = (y - y0) / CAVE_STEP, tz = (z - z0) / CAVE_STEP;
    const s = CAVE_STEP;
    const c000 = this.caveSample(x0, y0, z0), c100 = this.caveSample(x0 + s, y0, z0);
    const c010 = this.caveSample(x0, y0 + s, z0), c110 = this.caveSample(x0 + s, y0 + s, z0);
    const c001 = this.caveSample(x0, y0, z0 + s), c101 = this.caveSample(x0 + s, y0, z0 + s);
    const c011 = this.caveSample(x0, y0 + s, z0 + s), c111 = this.caveSample(x0 + s, y0 + s, z0 + s);
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    const y0v = x00 + (x10 - x00) * ty, y1v = x01 + (x11 - x01) * ty;
    return y0v + (y1v - y0v) * tz;
  }

  canCarve(y, h) {
    if (this.type === 'flat' || (this.preset && this.preset.noCaves)) return false;
    if (y <= 4) return false;
    if (y > h) return false;
    // keep a lid under the sea and near shores so water does not drain into caves
    if (h <= SEA + 3 && y >= h - 5) return false;
    return true;
  }

  generateFlat(chunk) {
    const b = chunk.blocks;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      for (let y = 0; y <= FLAT_Y; y++) {
        const id = y === 0 ? B.BEDROCK : y < FLAT_Y - 3 ? B.STONE : y < FLAT_Y ? B.DIRT : B.GRASS;
        b[(y * CS + z) * CS + x] = id;
      }
      for (let k = 0; k < 3; k++) chunk.grassTint[(z * CS + x) * 3 + k] = chunk.foliageTint[(z * CS + x) * 3 + k] = [186, 214, 150][k];
      storeWater(chunk, z * CS + x, WATER_STYLE.river);
    }
    chunk.maxY = 0;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) chunk.recomputeHeight(x, z);
  }

  generate(chunk) {
    if (this.type === 'flat') { this.generateFlat(chunk); return; }
    const { cx, cz } = chunk;
    const ox = cx * CS, oz = cz * CS;
    const blocks = chunk.blocks;
    const P = 1; // heights with 1-block border for slope
    const HW = CS + 2 * P;
    const heights = new Int16Array(HW * HW);
    for (let z = 0; z < HW; z++) for (let x = 0; x < HW; x++) heights[z * HW + x] = this.height(ox + x - P, oz + z - P);

    // Cave noise lattice for this chunk
    const NX = CS / CAVE_STEP + 1, NY = CH / CAVE_STEP + 1;
    const cave = new Float32Array(NX * NX * NY);
    for (let iy = 0; iy < NY; iy++) for (let iz = 0; iz < NX; iz++) for (let ix = 0; ix < NX; ix++) {
      cave[(iy * NX + iz) * NX + ix] = this.caveSample(ox + ix * CAVE_STEP, iy * CAVE_STEP, oz + iz * CAVE_STEP);
    }
    const caveLerp = (x, y, z) => {
      const ix = x >> 2, iy = y >> 2, iz = z >> 2;
      const tx = (x & 3) / 4, ty = (y & 3) / 4, tz = (z & 3) / 4;
      const i000 = (iy * NX + iz) * NX + ix;
      const i010 = i000 + NX * NX, i001 = i000 + NX, i011 = i010 + NX;
      const x00 = cave[i000] + (cave[i000 + 1] - cave[i000]) * tx;
      const x01 = cave[i001] + (cave[i001 + 1] - cave[i001]) * tx;
      const x10 = cave[i010] + (cave[i010 + 1] - cave[i010]) * tx;
      const x11 = cave[i011] + (cave[i011 + 1] - cave[i011]) * tx;
      const a = x00 + (x10 - x00) * ty, b = x01 + (x11 - x01) * ty;
      return a + (b - a) * tz;
    };

    const biomes = new Uint8Array(CS * CS);
    const owners = new Array(CS * CS);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = ox + x, wz = oz + z;
      const h = heights[(z + P) * HW + x + P];
      const slope = Math.max(
        Math.abs(heights[(z + P) * HW + x + P + 1] - heights[(z + P) * HW + x + P - 1]),
        Math.abs(heights[(z + P + 1) * HW + x + P] - heights[(z + P - 1) * HW + x + P]));
      const own = this.regionOwner(wx, wz);
      owners[z * CS + x] = own;
      let c;
      if (own) {
        c = own.p.column(this, wx - own.x, wz - own.z, h, slope);
        // near the edge of a place its raised lakes and rivers would stand as walls of water
        if (own.t > 0.08 && c.level > Math.max(h, SEA)) c.level = Math.max(h, SEA);
      } else c = this.defaultColumn(wx, wz, h, slope);
      biomes[z * CS + x] = c.biome;
      // biome tints (stored as multiplier * 200)
      for (let k = 0; k < 3; k++) {
        chunk.grassTint[(z * CS + x) * 3 + k] = clamp(c.tint[0][k] * 200, 0, 255);
        chunk.foliageTint[(z * CS + x) * 3 + k] = clamp(c.tint[1][k] * 200, 0, 255);
      }
      const pw = own && own.p.water;
      storeWater(chunk, z * CS + x, c.water || (pw ? (typeof pw === 'function' ? pw(this, wx - own.x, wz - own.z, h) : pw) : this.waterFor(wx, wz, h, c)));
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y < 4 && hash3(wx, y, wz, this.seed) < 0.5 - y * 0.12) id = B.BEDROCK;
        else if (y === h) id = c.top;
        else if (y > h - c.depth) id = c.filler;
        else if (c.under && y > h - c.depth - c.underDepth) id = c.under;
        else id = (c.band && c.band(y)) || c.stone;
        if (id !== B.BEDROCK && this.canCarve(y, h) && !(c.level > h && y >= h - 6) && caveLerp(x, y, z) < 0) id = y <= LAVA_Y ? B.LAVA : B.AIR;
        blocks[(y * CS + z) * CS + x] = id;
      }
      for (let y = h + 1; y <= c.level; y++) blocks[(y * CS + z) * CS + x] = c.ice && y === c.level ? B.ICE : c.liquid;
      // expose dirt under carved surface as grass
      if (h > SEA && blocks[(h * CS + z) * CS + x] === B.AIR) {
        for (let y = h - 1; y > 1; y--) {
          const i = (y * CS + z) * CS + x;
          if (blocks[i] === B.DIRT) { blocks[i] = B.GRASS; break; }
          if (blocks[i] !== B.AIR) break;
        }
      }
    }

    this.placeOres(chunk, ox, oz);
    this.placePlants(chunk, heights, HW, P, biomes, ox, oz, owners);
    this.placeCaveDecor(chunk, heights, HW, P, ox, oz);
    this.placeTrees(chunk, ox, oz);
    this.placeSprings(chunk, heights, HW, P, ox, oz);
    if (this.structs) placeStructures(this, chunk);
    if (this.preset && this.preset.build) this.preset.build(this, chunk);

    chunk.maxY = 0;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) chunk.recomputeHeight(x, z);
  }

  // Now and then a spring rises at the lip of a cliff: once the chunk loads, its water runs off
  // the edge as a waterfall (fluids.js) and spreads out below.
  placeSprings(chunk, heights, HW, P, ox, oz) {
    if (hash3(chunk.cx, 7, chunk.cz, this.seed + 5501) > 0.2) return;
    const b = chunk.blocks;
    let best = null, bestDrop = 6;
    for (let z = 2; z < CS - 2; z++) for (let x = 2; x < CS - 2; x++) {
      const h = heights[(z + P) * HW + x + P];
      if (h < SEA + 10 || h > CH - 4) continue;
      const top = b[(h * CS + z) * CS + x];
      if (IS_LIQUID(top) || top === B.ICE || !BLOCK_SOLID[top] || b[((h + 1) * CS + z) * CS + x] !== B.AIR) continue;
      // lowest neighbour column a couple of blocks away: the drop the water will fall down
      let low = h;
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) low = Math.min(low, heights[(z + P + dz) * HW + x + P + dx]);
      const drop = h - low;
      if (drop > bestDrop + hash3(ox + x, h, oz + z, this.seed) * 3) { bestDrop = drop; best = [x, h, z]; }
    }
    if (!best) return;
    const [x, y, z] = best;
    b[(y * CS + z) * CS + x] = B.WATER;
    chunk.springs = [ox + x, y, oz + z];
  }

  // Default water look of a column: oceans shade from deep blue through turquoise in warm shallows,
  // inland water (lakes, streams, springs) is greener, and murkier in forests.
  waterFor(wx, wz, h, c) {
    const { temp, hum } = this.climate(wx, wz);
    const cold = smoothstep(-0.12, -0.32, temp);
    if (c.level > SEA || h >= SEA || (h > SEA - 8 && this.riverAt(wx, wz) > 0.15)) {
      let w = mixWater(WATER_STYLE.river, WATER_STYLE.forest, smoothstep(0.0, 0.4, hum) * 0.8);
      if (temp > 0.2 && hum < 0.05) w = mixWater(w, WATER_STYLE.oasis, 0.5);
      return mixWater(w, WATER_STYLE.glacier, cold * 0.7);
    }
    const warm = smoothstep(0.02, 0.32, temp);
    const shallow = smoothstep(SEA - 14, SEA - 3, h);
    let w = mixWater(WATER_STYLE.deep, WATER_STYLE.ocean, smoothstep(SEA - 22, SEA - 9, h));
    w = mixWater(w, WATER_STYLE.tropic, warm * shallow);
    return mixWater(w, WATER_STYLE.cold, cold);
  }

  defaultColumn(wx, wz, h, slope) {
    const { temp, hum } = this.climate(wx, wz);
    const biome = this.biome(h, temp, hum);
    const t01 = clamp(temp * 0.5 + 0.5, 0, 1), h01 = clamp(hum * 0.5 + 0.5, 0, 1);
    const cold = [0.72, 0.9, 0.86], warm = [1.12, 1.02, 0.62], lush = [0.8, 1.06, 0.72];
    const gt = mixc(mixc(cold, warm, t01), lush, h01 * 0.6);
    const ft = mixc(gt, [0.78, 1.0, 0.7], 0.35);
    let top, filler, depth = 3, under = 0;
    switch (biome) {
      case BIOME.OCEAN: top = h < SEA - 8 ? B.GRAVEL : B.SAND; filler = B.SAND; break;
      case BIOME.BEACH: top = B.SAND; filler = B.SAND; break;
      case BIOME.DESERT: top = B.SAND; filler = B.SAND; depth = 4; under = B.SANDSTONE; break;
      case BIOME.SNOWY: top = h <= SEA + 1 ? B.SAND : B.SNOWY_GRASS; filler = B.DIRT; break;
      case BIOME.MOUNTAIN: top = h > SEA + 50 ? B.SNOW : (slope > 2 ? B.STONE : B.GRASS); filler = slope > 2 ? B.STONE : B.DIRT; break;
      default: top = slope > 4 ? B.STONE : B.GRASS; filler = slope > 4 ? B.STONE : B.DIRT;
    }
    if (biome !== BIOME.MOUNTAIN && biome !== BIOME.OCEAN && slope > 5 && h > SEA + 6) { top = B.STONE; filler = B.STONE; }
    // clay beds on shallow sea floors
    if (h < SEA && h > SEA - 7 && this.nPatch.noise2D(wx * 0.07, wz * 0.07) > 0.5) { top = B.CLAY; filler = B.CLAY; depth = 2; }
    if (this.ver >= 3 && top === B.GRASS && (biome === BIOME.FOREST || biome === BIOME.SNOWY) && this.nPatch.noise2D(wx * 0.03 + 5, wz * 0.03 + 9) > 0.55) top = B.PODZOL;
    if (this.ver >= 3 && top === B.GRASS && h <= SEA + 2 && hum > 0.3 && this.nPatch.noise2D(wx * 0.05 - 3, wz * 0.05 + 21) > 0.4) top = B.MUD;
    return { top, filler, depth, under, underDepth: 4, stone: B.STONE, band: null, liquid: B.WATER, level: SEA, ice: false, tint: [gt, ft], biome };
  }

  placeOres(chunk, ox, oz) {
    const rng = mulberry32((this.seed ^ Math.imul(chunk.cx, 73856093) ^ Math.imul(chunk.cz, 19349663)) | 0);
    const ores = [
      [B.GRANITE, 2, 26, 90], [B.DIORITE, 2, 26, 90], [B.ANDESITE, 2, 26, 90], [B.GRAVEL, 2, 18, 80], [B.DIRT, 2, 18, 80],
      [B.COAL_ORE, 14, 9, 100], [B.IRON_ORE, 9, 7, 64], [B.GOLD_ORE, 3, 6, 32], [B.DIAMOND_ORE, 2, 5, 16],
    ];
    if (this.ver >= 2) ores.push([B.EMERALD_ORE, 1, 3, 48]);   // appended so older worlds keep their ores
    if (this.ver >= 3) ores.push([B.TUFF, 2, 26, 30], [B.CALCITE, 1, 18, 70]);
    const b = chunk.blocks;
    for (const [id, veins, size, maxY] of ores) {
      for (let v = 0; v < veins; v++) {
        let x = Math.floor(rng() * CS), y = 2 + Math.floor(rng() * (maxY - 2)), z = Math.floor(rng() * CS);
        const n = 2 + Math.floor(rng() * size);
        for (let i = 0; i < n; i++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH) {
            const idx = (y * CS + z) * CS + x;
            if (b[idx] === B.STONE) b[idx] = id;
          }
          const r = rng();
          if (r < 0.33) x += rng() < 0.5 ? 1 : -1; else if (r < 0.66) y += rng() < 0.5 ? 1 : -1; else z += rng() < 0.5 ? 1 : -1;
        }
      }
    }
    // the deepest rock turns to deepslate, with a ragged top
    if (this.ver >= 3) {
      for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
        const top = 8 + Math.floor(hash3(ox + x, 1, oz + z, this.seed + 41) * 3 + this.nPatch.noise2D((ox + x) * 0.05, (oz + z) * 0.05) * 4);
        for (let y = 1; y < top; y++) { const i = (y * CS + z) * CS + x; if (b[i] === B.STONE) b[i] = B.DEEPSLATE; }
      }
    }
  }

  placePlants(chunk, heights, HW, P, biomes, ox, oz, owners) {
    const b = chunk.blocks;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = heights[(z + P) * HW + x + P];
      if (h + 3 >= CH) continue;
      const ground = b[(h * CS + z) * CS + x];
      const above = (h + 1) * CS * CS + z * CS + x;
      const own = owners[z * CS + x];
      if (b[above] !== B.AIR && !(own && b[above] === B.WATER)) continue;
      const biome = biomes[z * CS + x];
      const wx = ox + x, wz = oz + z;
      const r = hash3(wx, h, wz, this.seed + 5);
      if (own) {
        const pl = own.p.plant(this, wx - own.x, wz - own.z, h, ground, r);
        if (pl) for (let i = 0; i < pl.ids.length && h + 1 + i < CH; i++) {
          const k = ((h + 1 + i) * CS + z) * CS + x;
          if (b[k] === B.AIR || (pl.water && b[k] === B.WATER)) b[k] = pl.ids[i];
        }
        continue;
      }
      // sugar cane on shores next to water
      if ((ground === B.GRASS || ground === B.SAND || ground === B.DIRT) && h === SEA && r < 0.18) {
        const wet = heights[(z + P) * HW + x + P + 1] < SEA || heights[(z + P) * HW + x + P - 1] < SEA ||
          heights[(z + P + 1) * HW + x + P] < SEA || heights[(z + P - 1) * HW + x + P] < SEA;
        if (wet) {
          const n = 1 + Math.floor(hash3(wx, 9, wz, this.seed) * 3);
          for (let i = 1; i <= n; i++) b[((h + i) * CS + z) * CS + x] = B.SUGAR_CANE;
          continue;
        }
      }
      if (this.ver >= 3 && (ground === B.GRASS || ground === B.PODZOL)) {
        const pl = this.extraPlant(wx, wz, h, biome, ground, r);
        if (pl) {
          for (let i = 0; i < pl.length && h + 1 + i < CH; i++) b[((h + 1 + i) * CS + z) * CS + x] = pl[i];
          continue;
        }
        if (ground === B.PODZOL) continue;
      }
      if (ground === B.GRASS) {
        const grassChance = biome === BIOME.PLAINS ? 0.3 : biome === BIOME.FOREST ? 0.18 : 0.1;
        if (r < 0.014) b[above] = B.ROSE;
        else if (r < 0.03) b[above] = B.DANDELION;
        else if (r < 0.036 && biome === BIOME.PLAINS) b[above] = B.TULIP;
        else if (r < 0.042 && biome !== BIOME.DESERT) b[above] = B.BLUEBELL;
        else if (r < 0.0445 && biome === BIOME.FOREST) b[above] = hash3(wx, 3, wz, this.seed) < 0.5 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
        else if (r < 0.0457 && (biome === BIOME.PLAINS || biome === BIOME.FOREST)) b[above] = hash3(wx, 4, wz, this.seed) < 0.7 ? B.PUMPKIN : B.MELON;
        else if (r < 0.05 + grassChance) b[above] = biome === BIOME.FOREST && hash3(wx, 6, wz, this.seed) < 0.3 ? B.FERN : B.TALLGRASS;
      } else if (ground === B.SNOWY_GRASS && r < 0.06) {
        b[above] = B.FERN;
      } else if (ground === B.SAND && biome === BIOME.DESERT && h > SEA + 1) {
        if (r < 0.006) {
          const n = 1 + Math.floor(hash3(wx, 7, wz, this.seed) * 3);
          for (let i = 1; i <= n; i++) b[((h + i) * CS + z) * CS + x] = B.CACTUS;
        } else if (r < 0.016) b[above] = B.DEAD_BUSH;
      }
    }
  }

  // Generator 3 plants: flower meadows (lavender, sunflowers or mixed wildflowers), bushes,
  // bamboo in warm wet woods, lilies of the valley and ferns on the forest floor. null = none.
  extraPlant(wx, wz, h, biome, ground, r) {
    const { temp, hum } = this.climate(wx, wz);
    const r2 = hash3(wx, 8, wz, this.seed);
    if (ground === B.PODZOL) return r < 0.12 ? [B.FERN] : r < 0.15 ? [B.BUSH] : r < 0.16 ? [B.BROWN_MUSHROOM] : null;
    if (biome === BIOME.FOREST || biome === BIOME.PLAINS) {
      if (temp > 0.15 && hum > 0.2 && r > 0.975) return new Array(3 + Math.floor(r2 * 4)).fill(B.BAMBOO);
      if (r > 0.955 && r <= 0.975) return [B.BUSH];
    }
    if (biome === BIOME.PLAINS) {
      const meadow = this.nPatch.noise2D(wx * 0.018 + 91, wz * 0.018 - 33);
      if (meadow > 0.45 && r < 0.4) {
        const kind = this.nPatch.noise2D(wx * 0.004 - 7, wz * 0.004 + 55);
        if (kind > 0.3) return [B.LAVENDER];
        if (kind < -0.3) return r < 0.25 ? [B.SUNFLOWER] : null;
        const mix = [B.CORNFLOWER, B.DAISY, B.ALLIUM, B.PINK_TULIP, B.DAISY, B.ROSE, B.DANDELION, B.HYDRANGEA];
        return r < 0.3 ? [mix[Math.floor(r2 * mix.length)]] : null;
      }
      if (r > 0.94 && r <= 0.955) return [[B.DAISY, B.CORNFLOWER, B.PINK_TULIP][Math.floor(r2 * 3)]];
    }
    if (biome === BIOME.FOREST && r > 0.94 && r <= 0.955) return [r2 < 0.5 ? B.LILY_OF_VALLEY : B.HYDRANGEA];
    return null;
  }

  // Mushrooms on dark cave floors.
  placeCaveDecor(chunk, heights, HW, P, ox, oz) {
    const b = chunk.blocks;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = heights[(z + P) * HW + x + P];
      for (let y = LAVA_Y + 2; y < h - 4; y++) {
        const i = (y * CS + z) * CS + x;
        const fl = b[i - CS * CS];
        if (b[i] !== B.AIR || (fl !== B.STONE && !(this.ver >= 3 && (fl === B.DEEPSLATE || fl === B.TUFF)))) continue;
        const r = hash3(ox + x, y, oz + z, this.seed + 17);
        if (r < 0.006) b[i] = r < 0.003 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
        else if (this.ver >= 3 && y < 34 && r < 0.0085) b[i] = B.AMETHYST_CLUSTER;
      }
    }
  }

  // Trees are decided on a jittered grid, so every chunk can reproduce the parts of
  // neighbouring trees that overhang it without cross-chunk writes.
  // Trees of the default terrain plus those of any themed place overlapping this chunk.
  placeTrees(chunk, ox, oz) {
    if (this.preset) { this.placeTreeLayer(chunk, ox, oz, { p: this.preset, x: 0, z: 0 }); return; }
    const near = this.regions.filter((r) => Math.abs(r.x - (ox + 8)) < REGION_OUT + 60 && Math.abs(r.z - (oz + 8)) < REGION_OUT + 60);
    this.placeTreeLayer(chunk, ox, oz, null, near.length > 0);
    for (const r of near) this.placeTreeLayer(chunk, ox, oz, r);
  }

  // One jittered grid of tree candidates. `reg` = themed place owning its trees (null: default
  // rules); candidates whose column belongs to someone else are skipped.
  placeTreeLayer(chunk, ox, oz, reg, checkOwner) {
    const P = reg ? reg.p : null;
    const cell = P ? P.trees.cell : 5, R = P ? P.trees.R : this.ver >= 3 ? 7 : 3;
    const rx = reg ? reg.x : 0, rz = reg ? reg.z : 0;
    const b = chunk.blocks;
    const get = (wx, wy, wz) => {
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= CH) return -1;
      return b[(wy * CS + lz) * CS + lx];
    };
    const set = (wx, wy, wz, id) => {
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 1 || wy >= CH) return;
      b[(wy * CS + lz) * CS + lx] = id;
    };
    // grid in the place's local coordinates, so a place grows the same trees wherever it is
    const lox = ox - rx, loz = oz - rz;
    const gx0 = Math.floor((lox - R) / cell), gx1 = Math.floor((lox + CS + R) / cell);
    const gz0 = Math.floor((loz - R) / cell), gz1 = Math.floor((loz + CS + R) / cell);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const lx = gx * cell + Math.floor(hash3(gx, 1, gz, this.seed) * cell);
      const lz = gz * cell + Math.floor(hash3(gx, 2, gz, this.seed) * cell);
      const tx = lx + rx, tz = lz + rz;
      if (tx < ox - R || tx >= ox + CS + R || tz < oz - R || tz >= oz + CS + R) continue;
      if (reg && !this.preset) {
        const own = this.regionOwner(tx, tz);
        if (!own || own.x !== rx || own.z !== rz) continue;
      } else if (checkOwner && this.regionOwner(tx, tz)) continue;
      const h = this.height(tx, tz);
      if (P) {
        if (h > CH - 32) continue;
        const t = P.tree(this, lx, lz, h, hash3(gx, 3, gz, this.seed));
        if (!t) continue;
        const sl = Math.max(Math.abs(this.height(tx + 1, tz) - this.height(tx - 1, tz)), Math.abs(this.height(tx, tz + 1) - this.height(tx, tz - 1)));
        if (sl > 2) continue;
        if (this.canCarve(h, h) && this.caveAt(tx, h, tz) < 0) continue;
        buildTree(get, set, tx, h + 1, tz, t.kind, hash3(gx, 5, gz, this.seed), this.seed, t.dir);
        continue;
      }
      if (h <= SEA + 1 || h > SEA + 44) continue;
      if (this.structs && structZone(this, tx, tz)) continue;
      const { temp, hum } = this.climate(tx, tz);
      const biome = this.biome(h, temp, hum);
      const density = biome === BIOME.FOREST ? 0.82 : biome === BIOME.SNOWY ? 0.4 : biome === BIOME.PLAINS ? 0.06 : biome === BIOME.MOUNTAIN ? 0.12 : 0;
      // generator 3: a thin savanna of acacias on the greener edges of the deserts
      const dens = this.ver >= 3 && biome === BIOME.DESERT && hum > -0.3 ? 0.05 : density;
      if (hash3(gx, 3, gz, this.seed) >= dens) continue;
      // no trees on steep ground or above cave openings
      const sl = Math.max(Math.abs(this.height(tx + 1, tz) - this.height(tx - 1, tz)), Math.abs(this.height(tx, tz + 1) - this.height(tx, tz - 1)));
      if (sl > 2) continue;
      if (this.canCarve(h, h) && this.caveAt(tx, h, tz) < 0) continue;
      if (this.canCarve(h - 1, h) && this.caveAt(tx, h - 1, tz) < 0) continue;
      const r = hash3(gx, 4, gz, this.seed);
      let kind = 'oak';
      if (biome === BIOME.SNOWY || (biome === BIOME.MOUNTAIN && h > SEA + 20)) kind = 'spruce';
      else if (biome === BIOME.FOREST && r < 0.3) kind = 'birch';
      if (this.ver >= 3 && kind !== 'spruce') {
        // cherry groves, dark oak woods in wet forests and acacias in the hot dry lands
        const grove = this.nPatch.noise2D(tx * 0.006 + 40, tz * 0.006 - 17);
        if (biome === BIOME.DESERT || (biome === BIOME.PLAINS && temp > 0.18)) kind = 'acacia';
        else if (grove > 0.5 && temp > -0.1 && temp < 0.3) kind = 'cherry';
        else if (biome === BIOME.FOREST && hum > 0.25 && r > 0.45) kind = 'dark_oak';
        if (kind === 'cherry' && hash3(gx, 6, gz, this.seed) < 0.4) continue;   // groves stay airy
        if (kind !== 'oak' && kind !== 'birch' && this.structs && (structZone(this, tx + 4, tz + 4) || structZone(this, tx - 4, tz - 4) || structZone(this, tx + 4, tz - 4) || structZone(this, tx - 4, tz + 4))) kind = 'oak';
      }
      buildTree(get, set, tx, h + 1, tz, kind, hash3(gx, 5, gz, this.seed), this.seed);
    }
  }
}

// Shared by world generation and growing saplings. get() returns -1 outside the writable area.
function buildTree(get, set, x, y, z, kind, r, seed, dir) {
  const canLog = (id) => id === B.AIR || (id >= 0 && (BLOCK_RT[id] === RT_CROSS || BLOCK_RT[id] === RT_CUTOUT));
  const canLeaf = (id) => id === B.AIR || (id >= 0 && BLOCK_RT[id] === RT_CROSS && id !== B.SUGAR_CANE);
  const log = (wx, wy, wz, id) => { const c = get(wx, wy, wz); if (c >= 0 && canLog(c)) set(wx, wy, wz, id); };
  const leaf = (wx, wy, wz, id) => { const c = get(wx, wy, wz); if (c >= 0 && canLeaf(c)) set(wx, wy, wz, id); };
  const g = get(x, y - 1, z);
  if (g === B.GRASS || g === B.SNOWY_GRASS) set(x, y - 1, z, B.DIRT);
  if (kind === 'palm') {
    // leaning trunk and a crown of drooping fronds
    const hgt = 6 + Math.floor(r * 4);
    const a = dir !== undefined ? dir : hash3(x, y, z, seed + 3) * Math.PI * 2;
    const lx = Math.cos(a), lz = Math.sin(a);
    let px = x, pz = z, ox = 0, oz = 0;
    for (let i = 0; i < hgt; i++) {
      if (i > 2) { const k = (i - 2) / (hgt - 2); ox = lx * k * k * 3; oz = lz * k * k * 3; }
      px = x + Math.round(ox); pz = z + Math.round(oz);
      log(px, y + i, pz, B.PALM_LOG);
    }
    const top = y + hgt;
    leaf(px, top, pz, B.PALM_LEAVES);
    leaf(px, top - 1, pz, B.PALM_LEAVES);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const len = dx && dz ? 3 : 4;
      for (let k = 1; k <= len; k++) {
        const fy = top - (k >= 3 ? 1 : 0) - (k >= 4 ? 1 : 0);
        leaf(px + dx * k, fy, pz + dz * k, B.PALM_LEAVES);
        if (k === len) leaf(px + dx * k, fy - 1, pz + dz * k, B.PALM_LEAVES);
      }
    }
    return;
  }
  if (kind === 'dead') {
    const hgt = 3 + Math.floor(r * 3);
    for (let i = 0; i < hgt; i++) log(x, y + i, z, B.LOG);
    const bx = r < 0.5 ? 1 : -1;
    log(x + bx, y + hgt - 1, z, B.LOG); log(x + bx * 2, y + hgt, z, B.LOG);
    if (r > 0.3) { log(x, y + hgt - 2, z - bx, B.LOG); log(x, y + hgt - 1, z - bx * 2, B.LOG); }
    return;
  }
  if (kind === 'giant') {
    const hgt = 13 + Math.floor(r * 8);
    for (let i = -1; i < hgt; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) log(x + dx, y + i, z + dz, B.LOG);
    for (const [dx, dz] of [[-1, 0], [2, 1], [1, -1], [0, 2]]) { log(x + dx, y, z + dz, B.LOG); if (hash3(x + dx, y, z + dz, seed) < 0.5) log(x + dx, y + 1, z + dz, B.LOG); }
    const blob = (cx, cy, cz, rad) => {
      const R = Math.ceil(rad);
      for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const dd = (dx * dx + dz * dz) / (rad * rad) + (dy * dy) / (rad * rad * 0.45);
        if (dd > 1 || (dd > 0.7 && hash3(cx + dx, cy + dy, cz + dz, seed + 5) < 0.45)) continue;
        leaf(cx + dx, cy + dy, cz + dz, B.LEAVES);
      }
    };
    blob(x, y + hgt, z, 5.2);
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + r * 3, len = 3 + ((b + Math.floor(r * 7)) % 2);
      const by = y + hgt - 4 - (b % 2) * 2;
      const ex = x + Math.round(Math.cos(a) * len), ez = z + Math.round(Math.sin(a) * len);
      for (let s = 1; s <= len; s++) log(x + Math.round(Math.cos(a) * s), by + Math.floor(s / 2), z + Math.round(Math.sin(a) * s), B.LOG);
      blob(ex, by + 2, ez, 3.2);
    }
    return;
  }
  if (kind === 'spruce') {
    const hgt = 7 + Math.floor(r * 4);
    for (let i = 0; i < hgt; i++) log(x, y + i, z, B.SPRUCE_LOG);
    let rad = 0;
    for (let i = hgt; i >= 2; i--) {
      const yy = y + i;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
        leaf(x + dx, yy, z + dz, B.SPRUCE_LEAVES);
      }
      rad = rad >= 3 ? 1 : rad + 1;
      if (i === hgt) rad = 1;
    }
    leaf(x, y + hgt, z, B.SPRUCE_LEAVES);
    return;
  }
  if (kind === 'cherry') {
    // short trunk with a kink and a wide, flat cloud of blossom that droops at the rim
    const hgt = 4 + Math.floor(r * 3);
    const a = hash3(x, y, z, seed + 11) * Math.PI * 2, bx = Math.round(Math.cos(a)), bz = Math.round(Math.sin(a));
    let px = x, pz = z;
    for (let i = 0; i < hgt; i++) { if (i === hgt - 2) { px += bx; pz += bz; } log(px, y + i, pz, B.CHERRY_LOG); }
    const top = y + hgt;
    for (let dy = -1; dy <= 1; dy++) {
      const rad = dy === 1 ? 2.2 : dy === 0 ? 4.2 : 3.4, R = Math.ceil(rad);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const dd = Math.hypot(dx, dz);
        if (dd > rad || (dd > rad - 1 && hash3(px + dx, top + dy, pz + dz, seed + 13) < 0.4)) continue;
        leaf(px + dx, top + dy, pz + dz, B.CHERRY_LEAVES);
      }
    }
    for (let k = 0; k < 12; k++) {
      const an = k / 12 * Math.PI * 2, hx = px + Math.round(Math.cos(an) * 3.2), hz = pz + Math.round(Math.sin(an) * 3.2);
      if (hash3(hx, top, hz, seed + 17) < 0.5) leaf(hx, top - 2, hz, B.CHERRY_LEAVES);
    }
    return;
  }
  if (kind === 'dark_oak') {
    // thick 2x2 trunk under a broad, dense, low crown
    const hgt = 6 + Math.floor(r * 3);
    for (let i = 0; i < hgt; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) log(x + dx, y + i, z + dz, B.DARK_OAK_LOG);
    const top = y + hgt;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy === 1 ? 2.6 : dy === -2 ? 3.4 : 4.5, R = Math.ceil(rad);
      for (let dz = -R; dz <= R + 1; dz++) for (let dx = -R; dx <= R + 1; dx++) {
        const dd = Math.hypot(dx - 0.5, dz - 0.5);
        if (dd > rad || (dd > rad - 1 && hash3(x + dx, top + dy, z + dz, seed + 19) < 0.45)) continue;
        leaf(x + dx, top + dy, z + dz, B.DARK_OAK_LEAVES);
      }
    }
    return;
  }
  if (kind === 'acacia') {
    // a leaning, forked trunk with flat umbrella crowns
    const hgt = 4 + Math.floor(r * 2);
    const a = hash3(x, y, z, seed + 23) * Math.PI * 2, sx = Math.round(Math.cos(a)), sz = Math.round(Math.sin(a));
    let px = x, pz = z;
    for (let i = 0; i < hgt; i++) { if (i >= 2) { px += sx; pz += sz; } log(px, y + i, pz, B.ACACIA_LOG); }
    const crowns = [[px, y + hgt, pz]];
    if (r > 0.35) {
      let qx = x - sx, qz = z - sz;
      for (let i = 0; i < 3; i++) { if (i) { qx -= sx; qz -= sz; } log(qx, y + 2 + i, qz, B.ACACIA_LOG); }
      crowns.push([qx, y + 5, qz]);
    }
    for (const [cx, cy, cz] of crowns) {
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const dd = Math.abs(dx) + Math.abs(dz);
        if (dd <= 4 && !(dd === 4 && hash3(cx + dx, cy, cz + dz, seed + 29) < 0.5)) leaf(cx + dx, cy, cz + dz, B.ACACIA_LEAVES);
        if (dd <= 2) leaf(cx + dx, cy + 1, cz + dz, B.ACACIA_LEAVES);
      }
    }
    return;
  }
  const logId = kind === 'birch' ? B.BIRCH_LOG : B.LOG;
  const leaves = kind === 'birch' ? B.BIRCH_LEAVES : B.LEAVES;
  const hgt = (kind === 'birch' ? 5 : 4) + Math.floor(r * 3);
  for (let i = 0; i < hgt; i++) log(x, y + i, z, logId);
  const top = y + hgt;
  for (let yy = top - 3; yy <= top; yy++) {
    const rad = yy >= top - 1 ? 1 : 2;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
      if (corner && (yy === top || hash3(x + dx, yy, z + dz, seed + 9) < 0.5)) continue;
      leaf(x + dx, yy, z + dz, leaves);
    }
  }
}

class World {
  constructor(seed, type, ver = 1) {
    this.seed = seed;
    this.type = type === 'flat' || WORLD_PRESETS[type] ? type : 'default';
    this.genVer = ver;
    this.gen = new WorldGen(seed, this.type, ver);
    this.chunks = new Map();
    this.edits = new Map();   // chunkKey -> Map(blockIndex -> id)
    this.facing = new Map();  // posKey -> face index (0 +X, 1 -X, 4 +Z, 5 -Z)
    this.flow = new Map();    // posKey -> liquid level: 1..7 spreading (lava 2, 4, 6), 8 falling; absent = source
    this.blockEntities = new Map(); // posKey -> { type, ... }
    this.pictures = new Map();      // id -> picture hung by a player (pictures.js)
    this.editsDirty = false;
  }

  getChunk(cx, cz) { return this.chunks.get(chunkKey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return B.AIR;
    return c.blocks[(y * CS + (z & 15)) * CS + (x & 15)];
  }

  // Packed sky<<4 | block light (full daylight where the chunk has no light data yet).
  getLight(x, y, z) {
    if (y >= CH) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c || !c.light) return 0xf0;
    return c.light[(y * CS + (z & 15)) * CS + (x & 15)];
  }

  isLoaded(x, z) { return this.chunks.has(chunkKey(x >> 4, z >> 4)); }

  getFacing(x, y, z) {
    const k = posKey(x, y, z);
    const f = this.facing.get(k);
    if (f !== undefined) return f;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (c && c.gfacing) { const g = c.gfacing.get(k); if (g !== undefined) return g; }
    return [0, 1, 4, 5][Math.floor(hash3(x, y, z, 7) * 4)];
  }

  getFlow(x, y, z) { return this.flow.get(posKey(x, y, z)) || 0; }

  generateChunk(cx, cz) {
    const c = new Chunk(cx, cz);
    this.gen.generate(c);
    return this.addChunk(c);
  }

  // A chunk generated here or in a worker joins the world: player edits are replayed on it.
  addChunk(c) {
    const cx = c.cx, cz = c.cz;
    const e = this.edits.get(chunkKey(cx, cz));
    if (e) {
      for (const [idx, id] of e) c.blocks[idx] = id;
      for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) c.recomputeHeight(x, z);
    }
    this.chunks.set(chunkKey(cx, cz), c);
    if (c.gpics && typeof Pictures !== 'undefined' && this === G.world) Pictures.chunkLoaded(c);
    if (typeof Fluids !== 'undefined' && this === G.world) Fluids.chunkAdded(c);
    // neighbours may now be meshable / need border faces refreshed
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) n.needsMesh = true;
    }
    return c;
  }

  // Returns the list of chunks that must be re-meshed (edited chunk first).
  setBlock(x, y, z, id, facing) {
    if (y < 0 || y >= CH) return null;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c) return null;
    const lx = x & 15, lz = z & 15;
    const idx = (y * CS + lz) * CS + lx;
    const pk = posKey(x, y, z);
    if (facing !== undefined) this.facing.set(pk, facing);
    else if (!(FACING_BLOCKS.has(id) && FACING_BLOCKS.has(c.blocks[idx]))) this.facing.delete(pk);
    if (c.blocks[idx] === id) return facing !== undefined ? [c] : null;
    this.flow.delete(pk);
    c.blocks[idx] = id;
    c.recomputeHeight(lx, lz);
    const key = chunkKey(cx, cz);
    if (!this.edits.has(key)) this.edits.set(key, new Map());
    this.edits.get(key).set(idx, id);
    this.editsDirty = true;
    const out = [c];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) out.push(n);
    }
    return out;
  }

  surfaceHeight(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return -1;
    return c.heightmap[(z & 15) * CS + (x & 15)];
  }

  serializeEdits() {
    const out = {};
    for (const [key, m] of this.edits) {
      if (!m.size) continue;
      const arr = [];
      for (const [idx, id] of m) arr.push(idx, id);
      out[key] = arr;
    }
    return out;
  }

  loadEdits(obj) {
    this.edits.clear();
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      const key = Number(k), arr = obj[k];
      if (!Number.isFinite(key) || !Array.isArray(arr)) continue;
      const m = new Map();
      for (let i = 0; i + 1 < arr.length; i += 2) {
        const idx = arr[i] | 0, id = arr[i + 1] | 0;
        if (idx >= 0 && idx < CS * CS * CH && id >= 0 && id < MAX_BLOCK && BLOCK_NAME[id] !== undefined) m.set(idx, id);
      }
      this.edits.set(key, m);
    }
  }

  serializeExtras() {
    const facing = [];
    for (const [k, f] of this.facing) facing.push(k, f);
    const be = [];
    for (const [k, e] of this.blockEntities) be.push([k, e]);
    const flow = [];
    for (const [k, l] of this.flow) flow.push(k, l);
    return { facing, be, flow, pics: typeof serializePictures === 'function' ? serializePictures(this) : [] };
  }

  loadExtras(obj) {
    this.facing.clear();
    this.flow.clear();
    this.blockEntities.clear();
    this.pictures.clear();
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.pics) && typeof validPicture === 'function') for (const p of obj.pics) if (validPicture(p)) this.pictures.set(p.id, p);
    if (Array.isArray(obj.facing)) for (let i = 0; i + 1 < obj.facing.length; i += 2) {
      const k = Number(obj.facing[i]), f = obj.facing[i + 1] | 0;
      if (Number.isFinite(k) && validFacing(f)) this.facing.set(k, f);
    }
    if (Array.isArray(obj.flow)) for (let i = 0; i + 1 < obj.flow.length; i += 2) {
      const k = Number(obj.flow[i]), l = obj.flow[i + 1] | 0;
      if (Number.isFinite(k) && l >= 1 && l <= 8) this.flow.set(k, l);
    }
    if (Array.isArray(obj.be)) for (const pair of obj.be) {
      if (!Array.isArray(pair) || pair.length !== 2 || !Number.isFinite(Number(pair[0]))) continue;
      const e = pair[1];
      if (e && typeof e === 'object' && typeof e.type === 'string') this.blockEntities.set(Number(pair[0]), e);
    }
  }
}
