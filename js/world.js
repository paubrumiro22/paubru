'use strict';
// Chunk storage, terrain generation (biomes, caves, ores, trees, plants) and player edits.

const CS = 16;          // chunk width/depth
const CH = 128;         // world height
const SEA = 52;         // sea level (top water block y)
const CAVE_STEP = 4;    // cave noise sampled every 4 blocks, trilinear in between

function chunkKey(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
function blockIndex(x, y, z) { return (y * CS + z) * CS + x; }

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CS * CS * CH);
    this.heightmap = new Uint8Array(CS * CS);     // highest non-air y per column
    this.grassTint = new Uint8Array(CS * CS * 3);
    this.foliageTint = new Uint8Array(CS * CS * 3);
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
  constructor(seed) {
    this.seed = seed | 0;
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
  }

  height(x, z) {
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
    return {
      temp: this.nTemp.fbm2(x * 0.0011, z * 0.0011, 3),
      hum: this.nHum.fbm2(x * 0.0014 + 100, z * 0.0014 - 100, 3),
    };
  }

  biome(h, temp, hum) {
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
    if (y <= 4) return false;
    if (y > h) return false;
    // keep a lid under the sea and near shores so water does not drain into caves
    if (h <= SEA + 3 && y >= h - 5) return false;
    return true;
  }

  generate(chunk) {
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
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = ox + x, wz = oz + z;
      const h = heights[(z + P) * HW + x + P];
      const { temp, hum } = this.climate(wx, wz);
      const biome = this.biome(h, temp, hum);
      biomes[z * CS + x] = biome;
      const slope = Math.max(
        Math.abs(heights[(z + P) * HW + x + P + 1] - heights[(z + P) * HW + x + P - 1]),
        Math.abs(heights[(z + P + 1) * HW + x + P] - heights[(z + P - 1) * HW + x + P]));

      // biome tints (stored as multiplier * 200)
      const t01 = clamp(temp * 0.5 + 0.5, 0, 1), h01 = clamp(hum * 0.5 + 0.5, 0, 1);
      const cold = [0.72, 0.9, 0.86], warm = [1.12, 1.02, 0.62], lush = [0.8, 1.06, 0.72];
      const gt = mixc(mixc(cold, warm, t01), lush, h01 * 0.6);
      const ft = mixc(gt, [0.78, 1.0, 0.7], 0.35);
      for (let k = 0; k < 3; k++) {
        chunk.grassTint[(z * CS + x) * 3 + k] = clamp(gt[k] * 200, 0, 255);
        chunk.foliageTint[(z * CS + x) * 3 + k] = clamp(ft[k] * 200, 0, 255);
      }

      let top, filler, fillerDepth = 3;
      switch (biome) {
        case BIOME.OCEAN: top = h < SEA - 8 ? B.GRAVEL : B.SAND; filler = B.SAND; break;
        case BIOME.BEACH: top = B.SAND; filler = B.SAND; break;
        case BIOME.DESERT: top = B.SAND; filler = B.SAND; fillerDepth = 4; break;
        case BIOME.SNOWY: top = h <= SEA + 1 ? B.SAND : B.SNOWY_GRASS; filler = B.DIRT; break;
        case BIOME.MOUNTAIN: top = h > SEA + 50 ? B.SNOW : (slope > 2 ? B.STONE : B.GRASS); filler = slope > 2 ? B.STONE : B.DIRT; break;
        default: top = slope > 4 ? B.STONE : B.GRASS; filler = slope > 4 ? B.STONE : B.DIRT;
      }
      if (biome !== BIOME.MOUNTAIN && biome !== BIOME.OCEAN && slope > 5 && h > SEA + 6) { top = B.STONE; filler = B.STONE; }

      const col = z * CS + x;
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y < 4 && hash3(wx, y, wz, this.seed) < 0.5 - y * 0.12) id = B.BEDROCK;
        else if (y === h) id = top;
        else if (y > h - fillerDepth) id = filler;
        else if (biome === BIOME.DESERT && y > h - fillerDepth - 4) id = B.SANDSTONE;
        else id = B.STONE;
        if (id !== B.BEDROCK && this.canCarve(y, h) && caveLerp(x, y, z) < 0) id = B.AIR;
        blocks[(y * CS + z) * CS + x] = id;
      }
      for (let y = h + 1; y <= SEA; y++) blocks[(y * CS + z) * CS + x] = B.WATER;
      // expose dirt under carved surface as grass
      if (h > SEA && blocks[(h * CS + z) * CS + x] === B.AIR) {
        for (let y = h - 1; y > 1; y--) {
          const i = (y * CS + z) * CS + x;
          if (blocks[i] === B.DIRT) { blocks[i] = B.GRASS; break; }
          if (blocks[i] !== B.AIR) break;
        }
      }
      void col;
    }

    this.placeOres(chunk, ox, oz);
    this.placePlants(chunk, heights, HW, P, biomes, ox, oz);
    this.placeTrees(chunk, ox, oz);

    chunk.maxY = 0;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) chunk.recomputeHeight(x, z);
  }

  placeOres(chunk, ox, oz) {
    const rng = mulberry32((this.seed ^ Math.imul(chunk.cx, 73856093) ^ Math.imul(chunk.cz, 19349663)) | 0);
    const ores = [[B.COAL_ORE, 14, 8, 100], [B.IRON_ORE, 8, 6, 64], [B.GOLD_ORE, 3, 5, 32], [B.DIAMOND_ORE, 2, 4, 16]];
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

  placePlants(chunk, heights, HW, P, biomes, ox, oz) {
    const b = chunk.blocks;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = heights[(z + P) * HW + x + P];
      if (h + 1 >= CH) continue;
      const ground = b[(h * CS + z) * CS + x];
      const above = (h + 1) * CS * CS + z * CS + x;
      if (b[above] !== B.AIR) continue;
      const biome = biomes[z * CS + x];
      const r = hash3(ox + x, h, oz + z, this.seed + 5);
      if (ground === B.GRASS) {
        const grassChance = biome === BIOME.PLAINS ? 0.3 : biome === BIOME.FOREST ? 0.16 : 0.1;
        if (r < 0.018) b[above] = B.ROSE;
        else if (r < 0.04) b[above] = B.DANDELION;
        else if (r < 0.04 + grassChance) b[above] = B.TALLGRASS;
      } else if (ground === B.SAND && biome === BIOME.DESERT && r < 0.006 && h > SEA + 1) {
        const n = 1 + Math.floor(hash3(ox + x, 7, oz + z, this.seed) * 3);
        for (let i = 1; i <= n && h + i < CH; i++) b[((h + i) * CS + z) * CS + x] = B.CACTUS;
      }
    }
  }

  // Trees are decided on a jittered grid, so every chunk can reproduce the parts of
  // neighbouring trees that overhang it without cross-chunk writes.
  placeTrees(chunk, ox, oz) {
    const cell = 5, R = 3;
    const gx0 = Math.floor((ox - R) / cell), gx1 = Math.floor((ox + CS + R) / cell);
    const gz0 = Math.floor((oz - R) / cell), gz1 = Math.floor((oz + CS + R) / cell);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const tx = gx * cell + Math.floor(hash3(gx, 1, gz, this.seed) * cell);
      const tz = gz * cell + Math.floor(hash3(gx, 2, gz, this.seed) * cell);
      if (tx < ox - R || tx >= ox + CS + R || tz < oz - R || tz >= oz + CS + R) continue;
      const h = this.height(tx, tz);
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
      this.buildTree(chunk, ox, oz, tx, h + 1, tz, kind, hash3(gx, 5, gz, this.seed));
    }
  }

  buildTree(chunk, ox, oz, x, y, z, kind, r) {
    const b = chunk.blocks;
    const set = (wx, wy, wz, id, force) => {
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 1 || wy >= CH) return;
      const i = (wy * CS + lz) * CS + lx;
      const cur = b[i];
      if (force ? (cur === B.AIR || BLOCK_RT[cur] === RT_CROSS || BLOCK_RT[cur] === RT_CUTOUT) : (cur === B.AIR || BLOCK_RT[cur] === RT_CROSS)) b[i] = id;
    };
    const lx = x - ox, lz = z - oz;
    if (lx >= 0 && lx < CS && lz >= 0 && lz < CS && y - 1 >= 0) {
      const gi = ((y - 1) * CS + lz) * CS + lx;
      if (b[gi] === B.GRASS || b[gi] === B.SNOWY_GRASS) b[gi] = B.DIRT;
    }
    if (kind === 'spruce') {
      const hgt = 7 + Math.floor(r * 4);
      for (let i = 0; i < hgt; i++) set(x, y + i, z, B.SPRUCE_LOG, true);
      let rad = 0;
      for (let i = hgt; i >= 2; i--) {
        const yy = y + i;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
          set(x + dx, yy, z + dz, B.SPRUCE_LEAVES, false);
        }
        rad = rad >= 3 ? 1 : rad + 1;
        if (i === hgt) rad = 1;
      }
      set(x, y + hgt, z, B.SPRUCE_LEAVES, false);
      return;
    }
    const log = kind === 'birch' ? B.BIRCH_LOG : B.LOG;
    const leaves = kind === 'birch' ? B.BIRCH_LEAVES : B.LEAVES;
    const hgt = (kind === 'birch' ? 5 : 4) + Math.floor(r * 3);
    for (let i = 0; i < hgt; i++) set(x, y + i, z, log, true);
    const top = y + hgt;
    for (let yy = top - 3; yy <= top; yy++) {
      const rad = yy >= top - 1 ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
        if (corner && (yy === top || hash3(x + dx, yy, z + dz, this.seed + 9) < 0.5)) continue;
        set(x + dx, yy, z + dz, leaves, false);
      }
    }
  }
}

class World {
  constructor(seed) {
    this.seed = seed;
    this.gen = new WorldGen(seed);
    this.chunks = new Map();
    this.edits = new Map();   // chunkKey -> Map(blockIndex -> id)
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

  isLoaded(x, z) { return this.chunks.has(chunkKey(x >> 4, z >> 4)); }

  generateChunk(cx, cz) {
    const c = new Chunk(cx, cz);
    this.gen.generate(c);
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
  setBlock(x, y, z, id) {
    if (y < 0 || y >= CH) return null;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c) return null;
    const lx = x & 15, lz = z & 15;
    const idx = (y * CS + lz) * CS + lx;
    if (c.blocks[idx] === id) return null;
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
}
