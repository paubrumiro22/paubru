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
    this.blocks = new Uint8Array(CS * CS * CH);
    this.heightmap = new Uint8Array(CS * CS);     // highest non-air y per column
    this.grassTint = new Uint8Array(CS * CS * 3);
    this.foliageTint = new Uint8Array(CS * CS * 3);
    this.light = null;        // sky<<4 | block light, filled by the mesher
    this.maxY = 0;
    this.mesh = null;         // GPU buffers, owned by the renderer
    this.needsMesh = true;
    this.meshVersion = 0;
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

class WorldGen {
  constructor(seed, type) {
    this.seed = seed | 0;
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
    // themed places scattered through the regular world (see presets.js)
    this.regions = this.type === 'default' ? placeRegions(this.seed) : [];
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
    if (this.type === 'flat') return false;
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

    chunk.maxY = 0;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) chunk.recomputeHeight(x, z);
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
    return { top, filler, depth, under, underDepth: 4, stone: B.STONE, band: null, liquid: B.WATER, level: SEA, ice: false, tint: [gt, ft], biome };
  }

  placeOres(chunk, ox, oz) {
    const rng = mulberry32((this.seed ^ Math.imul(chunk.cx, 73856093) ^ Math.imul(chunk.cz, 19349663)) | 0);
    const ores = [
      [B.GRANITE, 2, 26, 90], [B.DIORITE, 2, 26, 90], [B.ANDESITE, 2, 26, 90], [B.GRAVEL, 2, 18, 80], [B.DIRT, 2, 18, 80],
      [B.COAL_ORE, 14, 9, 100], [B.IRON_ORE, 9, 7, 64], [B.GOLD_ORE, 3, 6, 32], [B.DIAMOND_ORE, 2, 5, 16],
    ];
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

  // Mushrooms on dark cave floors.
  placeCaveDecor(chunk, heights, HW, P, ox, oz) {
    const b = chunk.blocks;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = heights[(z + P) * HW + x + P];
      for (let y = LAVA_Y + 2; y < h - 4; y++) {
        const i = (y * CS + z) * CS + x;
        if (b[i] !== B.AIR || b[i - CS * CS] !== B.STONE) continue;
        const r = hash3(ox + x, y, oz + z, this.seed + 17);
        if (r < 0.006) b[i] = r < 0.003 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
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
    const cell = P ? P.trees.cell : 5, R = P ? P.trees.R : 3;
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
      const { temp, hum } = this.climate(tx, tz);
      const biome = this.biome(h, temp, hum);
      const density = biome === BIOME.FOREST ? 0.82 : biome === BIOME.SNOWY ? 0.4 : biome === BIOME.PLAINS ? 0.06 : biome === BIOME.MOUNTAIN ? 0.12 : 0;
      if (hash3(gx, 3, gz, this.seed) >= density) continue;
      // no trees on steep ground or above cave openings
      const sl = Math.max(Math.abs(this.height(tx + 1, tz) - this.height(tx - 1, tz)), Math.abs(this.height(tx, tz + 1) - this.height(tx, tz - 1)));
      if (sl > 2) continue;
      if (this.canCarve(h, h) && this.caveAt(tx, h, tz) < 0) continue;
      if (this.canCarve(h - 1, h) && this.caveAt(tx, h - 1, tz) < 0) continue;
      const r = hash3(gx, 4, gz, this.seed);
      let kind = 'oak';
      if (biome === BIOME.SNOWY || (biome === BIOME.MOUNTAIN && h > SEA + 20)) kind = 'spruce';
      else if (biome === BIOME.FOREST && r < 0.3) kind = 'birch';
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
  constructor(seed, type) {
    this.seed = seed;
    this.type = type === 'flat' || WORLD_PRESETS[type] ? type : 'default';
    this.gen = new WorldGen(seed, this.type);
    this.chunks = new Map();
    this.edits = new Map();   // chunkKey -> Map(blockIndex -> id)
    this.facing = new Map();  // posKey -> face index (0 +X, 1 -X, 4 +Z, 5 -Z)
    this.blockEntities = new Map(); // posKey -> { type, ... }
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
    const f = this.facing.get(posKey(x, y, z));
    if (f !== undefined) return f;
    return [0, 1, 4, 5][Math.floor(hash3(x, y, z, 7) * 4)];
  }

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
        if (idx >= 0 && idx < CS * CS * CH && id >= 0 && id < 256 && BLOCK_NAME[id] !== undefined) m.set(idx, id);
      }
      this.edits.set(key, m);
    }
  }

  serializeExtras() {
    const facing = [];
    for (const [k, f] of this.facing) facing.push(k, f);
    const be = [];
    for (const [k, e] of this.blockEntities) be.push([k, e]);
    return { facing, be };
  }

  loadExtras(obj) {
    this.facing.clear();
    this.blockEntities.clear();
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.facing)) for (let i = 0; i + 1 < obj.facing.length; i += 2) {
      const k = Number(obj.facing[i]), f = obj.facing[i + 1] | 0;
      if (Number.isFinite(k) && [0, 1, 4, 5].includes(f)) this.facing.set(k, f);
    }
    if (Array.isArray(obj.be)) for (const pair of obj.be) {
      if (!Array.isArray(pair) || pair.length !== 2 || !Number.isFinite(Number(pair[0]))) continue;
      const e = pair[1];
      if (e && typeof e === 'object' && typeof e.type === 'string') this.blockEntities.set(Number(pair[0]), e);
    }
  }
}
