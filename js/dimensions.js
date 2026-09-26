'use strict';
// Dimensions: the Nether, the End and the Deep Dark are far-away bands of the same world, so
// saving, online play and the cloud handle them like any other place. Portals take players from
// one to another (dimensions_game.js). Bands (world coordinates):
//   Nether     x >= 150 000   local x = x - 200 000   1 block = 8 in the Overworld
//   End        x <= -150 000  local x = x + 200 000   one fixed island group
//   Deep Dark  z >= 150 000   local z = z - 200 000   1 block = 4 in the Overworld
// Only "default" worlds have them. Generation is deterministic from the seed like the rest.

const DIM_OVER = 0, DIM_NETHER = 1, DIM_END = 2, DIM_DEEP = 3;
const DIM_EDGE = 150000, DIM_C = 200000;
const NETHER_LAVA = 31, DEEP_WATER = 20;

function dimAt(x, z) {
  if (x >= DIM_EDGE) return DIM_NETHER;
  if (x <= -DIM_EDGE) return DIM_END;
  if (z >= DIM_EDGE) return DIM_DEEP;
  return DIM_OVER;
}
function dimLocal(d, x, z) {
  return d === DIM_NETHER ? [x - DIM_C, z] : d === DIM_END ? [x + DIM_C, z] : d === DIM_DEEP ? [x, z - DIM_C] : [x, z];
}
function dimWorld(d, lx, lz) {
  return d === DIM_NETHER ? [lx + DIM_C, lz] : d === DIM_END ? [lx - DIM_C, lz] : d === DIM_DEEP ? [lx, lz + DIM_C] : [lx, lz];
}
// Where a portal at (x, z) in dimension `from` leads in dimension `to` (world x, z).
function dimTarget(from, to, x, z) {
  let ox = x, oz = z;
  if (from === DIM_NETHER) { ox = (x - DIM_C) * 8; oz = z * 8; }
  else if (from === DIM_DEEP) { ox = x * 4; oz = (z - DIM_C) * 4; }
  const lim = DIM_EDGE - 8000;
  ox = clamp(ox, -lim, lim); oz = clamp(oz, -lim, lim);
  if (to === DIM_NETHER) return [DIM_C + Math.round(ox / 8), Math.round(oz / 8)];
  if (to === DIM_DEEP) return [Math.round(ox / 4), DIM_C + Math.round(oz / 4)];
  if (to === DIM_END) return [-DIM_C + 96, 0];
  return [Math.round(ox), Math.round(oz)];
}

function dimNoise(g) {
  return g._dimN || (g._dimN = {
    a: new SimplexNoise(g.seed + 701), b: new SimplexNoise(g.seed + 709),
    c: new SimplexNoise(g.seed + 719), d: new SimplexNoise(g.seed + 727),
  });
}

// A density sampled every 4 blocks around a chunk (8 blocks of margin) and interpolated, so
// features that reach into the neighbours (trees, fungi) see exactly the same terrain.
function densityLattice(fn, lox, loz) {
  const X0 = lox - 8, Z0 = loz - 8, NX = 9, NY = CH / 4 + 1;
  const s = new Float32Array(NX * NX * NY);
  for (let iy = 0; iy < NY; iy++) for (let iz = 0; iz < NX; iz++) for (let ix = 0; ix < NX; ix++) {
    s[(iy * NX + iz) * NX + ix] = fn(X0 + ix * 4, iy * 4, Z0 + iz * 4);
  }
  return (x, y, z) => {
    const fx = (x - X0) / 4, fy = y / 4, fz = (z - Z0) / 4;
    const ix = clamp(Math.floor(fx), 0, NX - 2), iy = clamp(Math.floor(fy), 0, NY - 2), iz = clamp(Math.floor(fz), 0, NX - 2);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const i000 = (iy * NX + iz) * NX + ix, i010 = i000 + NX * NX, i001 = i000 + NX, i011 = i010 + NX;
    const a = s[i000] + (s[i000 + 1] - s[i000]) * tx, b = s[i001] + (s[i001 + 1] - s[i001]) * tx;
    const c = s[i010] + (s[i010 + 1] - s[i010]) * tx, d = s[i011] + (s[i011 + 1] - s[i011]) * tx;
    const lo = a + (b - a) * tz, hi = c + (d - c) * tz;
    return lo + (hi - lo) * ty;
  };
}

// Neutral tints and water colour for every column of a dimension chunk, then heights.
function dimFinish(chunk, water) {
  for (let i = 0; i < CS * CS; i++) {
    for (let k = 0; k < 3; k++) { chunk.grassTint[i * 3 + k] = 200; chunk.foliageTint[i * 3 + k] = 200; }
    storeWater(chunk, i, water);
  }
  chunk.maxY = 0;
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) chunk.recomputeHeight(x, z);
}

// ---------------------------------------------------------------- Nether ----
const NB_WASTES = 0, NB_CRIMSON = 1, NB_WARPED = 2, NB_BASALT = 3, NB_SOUL = 4;
function netherDensity(N, x, y, z) {
  let v = N.a.noise3D(x * 0.012, y * 0.03, z * 0.012) * 0.6 + N.b.noise3D(x * 0.035, y * 0.06, z * 0.035) * 0.28 + N.c.noise3D(x * 0.09, y * 0.12, z * 0.09) * 0.12;
  v += Math.max(0, (30 - y) / 22) * 1.1 + Math.max(0, (y - 98) / 20) * 1.3;
  return v - 0.2;
}
function netherBiome(N, x, z) {
  const t = N.d.noise2D(x * 0.0035, z * 0.0035), u = N.c.noise2D(x * 0.0035 + 400, z * 0.0035 - 300);
  return t > 0.3 ? NB_CRIMSON : t < -0.3 ? NB_WARPED : u > 0.33 ? NB_BASALT : u < -0.33 ? NB_SOUL : NB_WASTES;
}

function genNether(g, chunk) {
  const N = dimNoise(g), b = chunk.blocks, seed = g.seed;
  const ox = chunk.cx * CS, oz = chunk.cz * CS, lox = ox - DIM_C;
  const dens = densityLattice((x, y, z) => netherDensity(N, x, y, z), lox, oz);
  const at = (x, y, z) => (y * CS + z) * CS + x;
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const lx = lox + x, lz = oz + z;
    const bio = netherBiome(N, lx, lz);
    for (let y = 0; y < CH; y++) {
      let id;
      if (y === 0 || y === CH - 1 || (y < 4 && hash3(lx, y, lz, seed) < 0.5 - y * 0.12) || (y > CH - 5 && hash3(lx, y, lz, seed + 1) < (y - (CH - 5)) * 0.25)) id = B.BEDROCK;
      else if (dens(lx, y, lz) > 0) {
        id = B.NETHERRACK;
        if (bio === NB_BASALT) id = N.b.noise3D(lx * 0.08, y * 0.08, lz * 0.08) > 0.2 ? B.BLACKSTONE : B.BASALT;
        else {
          const h = hash3(lx >> 1, y >> 1, lz >> 1, seed + 3);
          if (h < 0.012) id = B.NETHER_QUARTZ_ORE;
          else if (h < 0.017) id = B.NETHER_GOLD_ORE;
          else if (y >= NETHER_LAVA - 3 && y <= NETHER_LAVA + 2 && hash3(lx, y, lz, seed + 4) < 0.2) id = B.MAGMA;
        }
      } else id = y <= NETHER_LAVA ? B.LAVA : B.AIR;
      b[at(x, y, z)] = id;
    }
    // surfaces: nylium, soul sand, glowstone on the ceilings, plants
    for (let y = 2; y < CH - 2; y++) {
      const i = at(x, y, z), id = b[i];
      if (id === B.AIR || id === B.LAVA || id === B.BEDROCK) continue;
      const above = b[i + CS * CS], below = b[i - CS * CS];
      if (above === B.AIR && id !== B.MAGMA) {
        if (bio === NB_CRIMSON) b[i] = B.CRIMSON_NYLIUM;
        else if (bio === NB_WARPED) b[i] = B.WARPED_NYLIUM;
        else if (bio === NB_SOUL) { b[i] = B.SOUL_SAND; if (b[i - CS * CS] === B.NETHERRACK) b[i - CS * CS] = B.SOUL_SAND; }
        else if (bio === NB_WASTES && hash3(lx, y, lz, seed + 5) < 0.02) b[i] = B.SOUL_SAND;
        const r = hash3(lx, y, lz, seed + 6);
        if (bio === NB_CRIMSON && r < 0.12) b[i + CS * CS] = r < 0.03 ? B.CRIMSON_FUNGUS : B.CRIMSON_ROOTS;
        else if (bio === NB_WARPED && r < 0.12) b[i + CS * CS] = r < 0.03 ? B.WARPED_FUNGUS : B.WARPED_ROOTS;
        else if (bio === NB_SOUL && r < 0.006) b[i + CS * CS] = B.SOUL_TORCH;
      } else if (below === B.AIR && y > 60 && hash3(lx >> 1, y >> 1, lz >> 1, seed + 7) < 0.05 && bio !== NB_BASALT) {
        // glowstone dripping from the roof
        b[i] = B.GLOWSTONE;
        const n = 1 + Math.floor(hash3(lx, y, lz, seed + 8) * 3);
        for (let k = 1; k <= n && b[i - k * CS * CS] === B.AIR; k++) b[i - k * CS * CS] = B.GLOWSTONE;
      }
    }
  }
  netherFungi(g, N, chunk, dens);
  for (const p of dimPlansNear(g, DIM_NETHER, lox, oz)) buildFortress(g, p, chunk);
  dimFinish(chunk, WATER_STYLE.river);
}

// Huge crimson and warped fungi on a jittered grid (like the Overworld's trees).
function netherFungi(g, N, chunk, dens) {
  const ox = chunk.cx * CS, oz = chunk.cz * CS, lox = ox - DIM_C, b = chunk.blocks, seed = g.seed;
  const set = (lx, y, lz, id, soft) => {
    const x = lx - lox, z = lz - oz;
    if (x < 0 || x >= CS || z < 0 || z >= CS || y < 1 || y >= CH - 1) return;
    const i = (y * CS + z) * CS + x;
    if (soft && b[i] !== B.AIR && BLOCK_RT[b[i]] !== RT_CROSS) return;
    b[i] = id;
  };
  const cell = 7, R = 4;
  for (let gz = Math.floor((oz - R) / cell); gz <= Math.floor((oz + CS + R) / cell); gz++) {
    for (let gx = Math.floor((lox - R) / cell); gx <= Math.floor((lox + CS + R) / cell); gx++) {
      if (hash3(gx, 1, gz, seed + 31) > 0.55) continue;
      const tx = gx * cell + Math.floor(hash3(gx, 2, gz, seed + 31) * cell), tz = gz * cell + Math.floor(hash3(gx, 3, gz, seed + 31) * cell);
      if (tx < lox - R || tx >= lox + CS + R || tz < oz - R || tz >= oz + CS + R) continue;
      const bio = netherBiome(N, tx, tz);
      if (bio !== NB_CRIMSON && bio !== NB_WARPED) continue;
      // lowest floor above the lava with room for the stem
      let fy = -1;
      for (let y = NETHER_LAVA + 1; y < 90; y++) {
        if (dens(tx, y, tz) > 0 && dens(tx, y + 1, tz) <= 0) {
          let room = true;
          for (let k = 2; k < 11; k++) if (dens(tx, y + k, tz) > 0) { room = false; break; }
          if (room) { fy = y; break; }
        }
      }
      if (fy < 0) continue;
      const crimson = bio === NB_CRIMSON, stem = crimson ? B.CRIMSON_STEM : B.WARPED_STEM, wart = crimson ? B.NETHER_WART_BLOCK : B.WARPED_WART_BLOCK;
      const hgt = 5 + Math.floor(hash3(gx, 4, gz, seed + 31) * 4), top = fy + hgt;
      for (let y = fy + 1; y <= top; y++) set(tx, y, tz, stem);
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy === 1 ? 1.5 : dy === 0 ? 3.2 : 3.4;
        for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
          const dd = Math.hypot(dx, dz);
          if (dd > rad) continue;
          if (dy < 0 && dd < rad - 1.1) continue;           // a hollow cap: rim hangs down, inside open
          const h = hash3(tx + dx, top + dy, tz + dz, seed + 33);
          set(tx + dx, top + dy, tz + dz, h < 0.07 ? B.SHROOMLIGHT : wart, true);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ End ----
function endColumn(N, x, z) {
  const r = Math.hypot(x, z);
  if (r < 120) {
    const k = r / 120;
    const top = Math.round(60 + N.a.noise2D(x * 0.03, z * 0.03) * 2 - k * k * 7);
    const depth = Math.round(Math.sqrt(Math.max(0, 1 - k * k)) * 34 * (0.85 + 0.15 * N.b.noise2D(x * 0.05, z * 0.05)) + 2);
    return [top, top - depth];
  }
  if (r > 330) {
    const m = N.c.noise2D(x * 0.006, z * 0.006) * 0.7 + N.d.noise2D(x * 0.025, z * 0.025) * 0.3;
    if (m > 0.4) {
      const t = (m - 0.4) / 0.6;
      const top = Math.round(56 + N.a.noise2D(x * 0.01, z * 0.01) * 8 + t * 5);
      return [top, top - Math.round(3 + t * 42)];
    }
  }
  return null;
}
const END_PILLARS = Array.from({ length: 10 }, (_, i) => {
  const a = i / 10 * Math.PI * 2 + 0.3;
  return { x: Math.round(Math.cos(a) * 44), z: Math.round(Math.sin(a) * 44), r: 2 + (i % 3), h: 76 + ((i * 9) % 30), cage: i % 4 === 0 };
});
function genEnd(g, chunk) {
  const N = dimNoise(g), b = chunk.blocks, seed = g.seed;
  const ox = chunk.cx * CS, oz = chunk.cz * CS, lox = ox + DIM_C;
  const at = (x, y, z) => (y * CS + z) * CS + x;
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const lx = lox + x, lz = oz + z;
    const col = endColumn(N, lx, lz);
    if (!col) continue;
    for (let y = Math.max(1, col[1]); y <= col[0] && y < CH; y++) b[at(x, y, z)] = B.END_STONE;
  }
  // obsidian pillars round the main island with a glowing crystal on each
  for (const P of END_PILLARS) {
    if (P.x + P.r + 2 < lox || P.x - P.r - 2 >= lox + CS || P.z + P.r + 2 < oz || P.z - P.r - 2 >= oz + CS) continue;
    for (let dz = -P.r - 2; dz <= P.r + 2; dz++) for (let dx = -P.r - 2; dx <= P.r + 2; dx++) {
      const x = P.x + dx - lox, z = P.z + dz - oz;
      if (x < 0 || x >= CS || z < 0 || z >= CS) continue;
      const d = Math.hypot(dx, dz);
      if (d <= P.r + 0.3) for (let y = 40; y <= P.h; y++) b[at(x, y, z)] = B.OBSIDIAN;
      if (dx === 0 && dz === 0) { b[at(x, P.h + 1, z)] = B.BEDROCK; b[at(x, P.h + 2, z)] = B.END_CRYSTAL; }
      if (P.cage && Math.max(Math.abs(dx), Math.abs(dz)) === 2) for (let y = P.h + 1; y <= P.h + 4; y++) b[at(x, y, z)] = B.IRON_BARS;
      if (P.cage && Math.max(Math.abs(dx), Math.abs(dz)) <= 2) b[at(x, P.h + 5, z)] = B.IRON_BARS;
    }
  }
  // the exit portal in the middle of the main island
  if (lox <= 4 && lox + CS > -4 && oz <= 4 && oz + CS > -4) {
    const T = endColumn(N, 0, 0)[0];
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const x = dx - lox, z = dz - oz;
      if (x < 0 || x >= CS || z < 0 || z >= CS) continue;
      const d = Math.hypot(dx, dz);
      if (d > 3.6) continue;
      b[at(x, T, z)] = B.BEDROCK;
      if (d > 2.6) b[at(x, T + 1, z)] = B.BEDROCK;
      else if (dx === 0 && dz === 0) { for (let y = T + 1; y <= T + 4; y++) b[at(x, y, z)] = B.BEDROCK; b[at(x, T + 5, z)] = B.END_ROD; }
      else b[at(x, T + 1, z)] = B.END_PORTAL;
    }
  }
  endChorus(g, N, chunk);
  for (const p of dimPlansNear(g, DIM_END, lox, oz)) buildEndCity(g, p, chunk);
  dimFinish(chunk, WATER_STYLE.river);
}

// Chorus plants on the outer islands: a stalk with a few upturned branches and flowers.
function endChorus(g, N, chunk) {
  const ox = chunk.cx * CS, oz = chunk.cz * CS, lox = ox + DIM_C, b = chunk.blocks, seed = g.seed;
  const set = (lx, y, lz, id) => {
    const x = lx - lox, z = lz - oz;
    if (x < 0 || x >= CS || z < 0 || z >= CS || y < 1 || y >= CH) return;
    const i = (y * CS + z) * CS + x;
    if (b[i] === B.AIR) b[i] = id;
  };
  const cell = 8, R = 3;
  for (let gz = Math.floor((oz - R) / cell); gz <= Math.floor((oz + CS + R) / cell); gz++) {
    for (let gx = Math.floor((lox - R) / cell); gx <= Math.floor((lox + CS + R) / cell); gx++) {
      if (hash3(gx, 1, gz, seed + 41) > 0.5) continue;
      const tx = gx * cell + Math.floor(hash3(gx, 2, gz, seed + 41) * cell), tz = gz * cell + Math.floor(hash3(gx, 3, gz, seed + 41) * cell);
      if (Math.hypot(tx, tz) < 330) continue;
      const col = endColumn(N, tx, tz);
      if (!col) continue;
      const hgt = 3 + Math.floor(hash3(gx, 4, gz, seed + 41) * 4);
      for (let y = col[0] + 1; y <= col[0] + hgt; y++) set(tx, y, tz, B.CHORUS_PLANT);
      set(tx, col[0] + hgt + 1, tz, B.CHORUS_FLOWER);
      for (let k = 0; k < 2; k++) {
        const dir = Math.floor(hash3(gx, 5 + k, gz, seed + 41) * 4), [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][dir];
        const by = col[0] + 2 + k;
        set(tx + dx, by, tz + dz, B.CHORUS_PLANT); set(tx + dx, by + 1, tz + dz, B.CHORUS_PLANT); set(tx + dx, by + 2, tz + dz, B.CHORUS_FLOWER);
      }
    }
  }
}

// ------------------------------------------------------------- Deep Dark ----
function deepDensity(N, x, y, z) {
  let v = N.a.noise3D(x * 0.011, y * 0.022, z * 0.011) * 0.62 + N.b.noise3D(x * 0.03, y * 0.05, z * 0.03) * 0.26 + N.c.noise3D(x * 0.08, y * 0.1, z * 0.08) * 0.12;
  v += Math.max(0, (16 - y) / 12) * 1.2 + Math.max(0, (y - 66) / 18) * 1.4;
  return v - 0.14;
}
function genDeep(g, chunk) {
  const N = dimNoise(g), b = chunk.blocks, seed = g.seed;
  const ox = chunk.cx * CS, oz = chunk.cz * CS, loz = oz - DIM_C;
  const dens = densityLattice((x, y, z) => deepDensity(N, x, y, z), ox, loz);
  const at = (x, y, z) => (y * CS + z) * CS + x;
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const lx = ox + x, lz = loz + z;
    for (let y = 0; y < CH; y++) {
      let id;
      if (y === 0 || y === CH - 1 || (y < 4 && hash3(lx, y, lz, seed) < 0.5 - y * 0.12) || (y > CH - 5 && hash3(lx, y, lz, seed + 1) < (y - (CH - 5)) * 0.25)) id = B.BEDROCK;
      else if (dens(lx, y, lz) > 0) {
        id = B.DEEPSLATE;
        const t = N.d.noise3D(lx * 0.05, y * 0.05, lz * 0.05);
        if (t > 0.45) id = B.TUFF;
        else if (hash3(lx >> 1, y >> 1, lz >> 1, seed + 3) < 0.006) id = B.DIAMOND_ORE;
      } else id = y <= DEEP_WATER ? B.WATER : B.AIR;
      b[at(x, y, z)] = id;
    }
    // sculk spreads over the floors (and some ceilings); sensors, shriekers, glow lichen
    for (let y = 2; y < 90; y++) {
      const i = at(x, y, z), id = b[i];
      if (id !== B.DEEPSLATE && id !== B.TUFF) continue;
      const above = b[i + CS * CS], below = b[i - CS * CS];
      const patch = N.c.noise3D(lx * 0.04, y * 0.04, lz * 0.04);
      if (above === B.AIR) {
        const r = hash3(lx, y, lz, seed + 9);
        if (patch > 0.05) {
          b[i] = r < 0.012 ? B.SCULK_SENSOR : r < 0.016 ? B.SCULK_SHRIEKER : r < 0.0175 ? B.SCULK_CATALYST : B.SCULK;
          if (below === B.DEEPSLATE && patch > 0.3) b[i - CS * CS] = B.SCULK;
        } else if (r < 0.03) b[i + CS * CS] = B.GLOW_LICHEN;
      } else if (below === B.AIR && patch > 0.35) b[i] = B.SCULK;
    }
  }
  for (const p of dimPlansNear(g, DIM_DEEP, ox, loz)) buildAncientCity(g, p, chunk);
  dimFinish(chunk, WATER_STYLE.cold || WATER_STYLE.river);
}

// --------------------------------------------------- dimension structures ----
// One plan per 320-block cell of a dimension's local coordinates (fortresses, end cities, ancient
// cities), cached on the generator.
const DIM_CELL = 320, DIM_REACH = 64;
function dimPlan(g, d, ix, iz) {
  const cache = g._dimPlans || (g._dimPlans = new Map());
  const key = d + ':' + ix + ':' + iz;
  if (cache.has(key)) return cache.get(key);
  const rng = mulberry32((g.seed ^ Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(d, 83492791) ^ 0x2c1b3c6d) | 0);
  let plan = null;
  const cx = ix * DIM_CELL + 80 + Math.floor(rng() * (DIM_CELL - 160)), cz = iz * DIM_CELL + 80 + Math.floor(rng() * (DIM_CELL - 160));
  const roll = rng();
  if (d === DIM_NETHER && roll < 0.55) plan = { type: 'fortress', x: cx, z: cz, y: 58 + Math.floor(rng() * 12), arms: [rng() < 0.85, rng() < 0.85, rng() < 0.85, rng() < 0.85], len: 28 + Math.floor(rng() * 16) };
  else if (d === DIM_END && roll < 0.45 && Math.hypot(cx, cz) > 420) {
    const col = endColumn(dimNoise(g), cx, cz);
    if (col) plan = { type: 'endcity', x: cx, z: cz, y: col[0] + 1, h: 18 + Math.floor(rng() * 14) };
  } else if (d === DIM_DEEP && roll < 0.6) plan = { type: 'ancient', x: cx, z: cz, y: 26 };
  // the first ancient city sits next to the origin, so the portal there has somewhere to go
  if (d === DIM_DEEP && ix === 0 && iz === 0) plan = { type: 'ancient', x: 0, z: 0, y: 26 };
  cache.set(key, plan);
  return plan;
}
function dimPlansNear(g, d, lx0, lz0) {
  const out = [];
  const i0 = Math.floor((lx0 - DIM_REACH) / DIM_CELL), i1 = Math.floor((lx0 + CS + DIM_REACH) / DIM_CELL);
  const j0 = Math.floor((lz0 - DIM_REACH) / DIM_CELL), j1 = Math.floor((lz0 + CS + DIM_REACH) / DIM_CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const p = dimPlan(g, d, i, j);
    if (p && Math.abs(p.x - (lx0 + 8)) < DIM_REACH + 8 && Math.abs(p.z - (lz0 + 8)) < DIM_REACH + 8) out.push(p);
  }
  return out;
}
// structWriter in a dimension's local coordinates
function dimWriter(chunk, d) {
  const W = structWriter(chunk);
  const [dx, dz] = dimWorld(d, 0, 0);
  return {
    set(x, y, z, id, f) { W.set(x + dx, y, z + dz, id, f); },
    get(x, y, z) { return W.get(x + dx, y, z + dz); },
    loot(x, y, z, kind) { W.loot(x + dx, y, z + dz, kind); },
    has(x, z) { return W.has(x + dx, z + dz); },
  };
}

// Nether fortress: nether-brick bridges in a cross from a walled hall, on pillars down to the lava.
function buildFortress(g, P, chunk) {
  const W = dimWriter(chunk, DIM_NETHER), Y = P.y;
  const deck = (x, z) => {
    if (!W.has(x, z)) return;
    for (let y = Y - 1; y <= Y; y++) W.set(x, y, z, B.NETHER_BRICKS);
    for (let y = Y + 1; y <= Y + 5; y++) W.set(x, y, z, B.AIR);
  };
  const pillar = (x, z) => {
    if (!W.has(x, z)) return;
    for (let y = Y - 2; y > 2; y--) { const id = W.get(x, y, z); if (id !== B.AIR && id !== B.LAVA && y < NETHER_LAVA - 2) break; W.set(x, y, z, B.NETHER_BRICKS); }
  };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  dirs.forEach(([ax, az], k) => {
    if (!P.arms[k]) return;
    for (let s = 6; s <= P.len; s++) for (let w = -2; w <= 2; w++) {
      const x = P.x + ax * s + (az ? w : 0), z = P.z + az * s + (ax ? w : 0);
      deck(x, z);
      if (Math.abs(w) === 2 && W.has(x, z)) W.set(x, Y + 1, z, B.NETHER_BRICK_FENCE);
      if (s % 8 === 0 && Math.abs(w) <= 1) pillar(x, z);
      if (s % 8 === 0 && w === 2 && W.has(x, z)) W.set(x, Y + 2, z, B.SOUL_LANTERN);
    }
    // a small tower at the end of each arm
    const ex = P.x + ax * (P.len + 3), ez = P.z + az * (P.len + 3);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = ex + dx, z = ez + dz;
      if (!W.has(x, z)) continue;
      const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 3;
      for (let y = Y - 1; y <= Y + 8; y++) {
        let id = B.AIR;
        if (y <= Y || y === Y + 8) id = B.NETHER_BRICKS;
        else if (edge) id = (y === Y + 3 || y === Y + 4) && (dx === 0 || dz === 0) ? B.NETHER_BRICK_FENCE : B.NETHER_BRICKS;
        W.set(x, y, z, id);
      }
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) pillar(x, z);
    }
    // the doorway from the bridge
    for (let w = -1; w <= 1; w++) for (let y = Y + 1; y <= Y + 3; y++) {
      const x = ex - ax * 3 + (az ? w : 0), z = ez - az * 3 + (ax ? w : 0);
      if (W.has(x, z)) W.set(x, y, z, B.AIR);
    }
  });
  // the central hall
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const x = P.x + dx, z = P.z + dz;
    if (!W.has(x, z)) continue;
    const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 6;
    const door = edge && Math.min(Math.abs(dx), Math.abs(dz)) <= 1;
    for (let y = Y - 1; y <= Y + 7; y++) {
      let id = B.AIR;
      if (y <= Y || y === Y + 7) id = B.NETHER_BRICKS;
      else if (edge && !(door && y <= Y + 3)) id = y === Y + 4 && !door && (dx + dz) % 2 === 0 ? B.NETHER_BRICK_FENCE : B.NETHER_BRICKS;
      W.set(x, y, z, id);
    }
    if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) pillar(x, z);
  }
  for (const [dx, dz] of [[-4, -4], [4, 4]]) if (W.has(P.x + dx, P.z + dz)) { W.set(P.x + dx, Y + 1, P.z + dz, B.CHEST, dx > 0 ? 1 : 0); W.loot(P.x + dx, Y + 1, P.z + dz, 'fortress'); }
  for (const [dx, dz] of [[-4, 4], [4, -4], [0, 0]]) if (W.has(P.x + dx, P.z + dz)) W.set(P.x + dx, Y + 6, P.z + dz, B.SOUL_LANTERN, 8);
}

// End city: a purpur tower with end-rod lamps and a loot room at the top.
function buildEndCity(g, P, chunk) {
  const W = dimWriter(chunk, DIM_END), Y = P.y, H = P.h;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const x = P.x + dx, z = P.z + dz;
    if (!W.has(x, z)) continue;
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    for (let y = Y - 3; y <= Y + H + 1; y++) {
      let id = B.AIR;
      const floor = (y - Y) % 6 === 0;
      if (y < Y) id = ring <= 3 ? B.END_STONE_BRICKS : B.AIR;
      else if (ring === 4) id = (Math.abs(dx) === 4 && Math.abs(dz) === 4) ? B.PURPUR_PILLAR : (y - Y) % 6 === 3 && Math.min(Math.abs(dx), Math.abs(dz)) <= 1 ? B.GLASS : B.PURPUR;
      else if (floor || y === Y + H + 1) id = dx === 1 && dz === 0 && y > Y && y < Y + H ? B.AIR : B.PURPUR;
      if (id !== B.AIR || y >= Y) W.set(x, y, z, id);
    }
    // a ladder up a central pillar and a doorway
    if (dx === 0 && dz === 0) for (let y = Y + 1; y <= Y + H; y++) W.set(x, y, z, B.PURPUR_PILLAR);
    if (dx === 1 && dz === 0) for (let y = Y + 1; y <= Y + H; y++) W.set(x, y, z, B.LADDER, 0);
    if (dz === -4 && Math.abs(dx) <= 1) for (let y = Y + 1; y <= Y + 3; y++) W.set(x, y, z, B.AIR);
  }
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) if (W.has(P.x + dx, P.z + dz)) for (let y = Y + 1; y < Y + H; y += 6) W.set(P.x + dx, y, P.z + dz, B.END_ROD);
  if (W.has(P.x - 2, P.z + 2)) { W.set(P.x - 2, Y + H - 5, P.z + 2, B.CHEST, 4); W.loot(P.x - 2, Y + H - 5, P.z + 2, 'endcity'); }
  for (const [dx, dz] of [[-4, 0], [4, 0], [0, 4]]) if (W.has(P.x + dx, P.z + dz)) W.set(P.x + dx, Y + H + 2, P.z + dz, B.END_ROD);
}

// Ancient city: a buried plaza of deepslate with a great reinforced-deepslate portal (a working
// way home), ruined halls with chests, soul lanterns, and plenty of sculk and shriekers.
function buildAncientCity(g, P, chunk) {
  const W = dimWriter(chunk, DIM_DEEP), Y = P.y, seed = g.seed;
  const RX = 34, RZ = 26;
  for (let dz = -RZ; dz <= RZ; dz++) for (let dx = -RX; dx <= RX; dx++) {
    const x = P.x + dx, z = P.z + dz;
    if (!W.has(x, z)) continue;
    const edge = Math.max(Math.abs(dx) / RX, Math.abs(dz) / RZ);
    const roof = Y + 18 - Math.round(edge * edge * 8);
    for (let y = Y - 4; y <= roof; y++) {
      let id = B.AIR;
      if (y < Y) id = B.DEEPSLATE;
      else if (y === Y) {
        const path = Math.abs(dx) <= 2 || Math.abs(dz) <= 2;
        id = path ? B.DEEPSLATE_TILES : ((dx + dz) & 7) === 0 ? B.CHISELED_STONE_BRICKS : B.DEEPSLATE_BRICKS;
        if (!path && hash3(x, y, z, seed + 51) < 0.25) id = B.SCULK;
      }
      W.set(x, y, z, id);
    }
    if (Math.abs(dz) === RZ || Math.abs(dx) === RX) for (let y = Y + 1; y <= Y + 3; y++) W.set(x, y, z, B.DEEPSLATE_BRICKS);
  }
  // the great portal in the middle (facing along z), its frame shaped like a watchful head
  for (let dx = -5; dx <= 5; dx++) for (let y = Y + 1; y <= Y + 13; y++) {
    const x = P.x + dx, z = P.z;
    if (!W.has(x, z)) continue;
    const frame = Math.abs(dx) === 5 || y === Y + 1 || y === Y + 13 || (y === Y + 12 && Math.abs(dx) >= 3);
    if (frame) W.set(x, y, z, B.REINFORCED_DEEPSLATE);
    else W.set(x, y, z, B.DEEP_PORTAL, 4);
  }
  for (const s of [-1, 1]) for (let y = Y + 1; y <= Y + 15; y++) {
    const x = P.x + s * 7;
    if (W.has(x, P.z)) W.set(x, y, P.z, y <= Y + 13 ? B.DEEPSLATE_BRICKS : y === Y + 14 ? B.SOUL_LANTERN : B.AIR, y === Y + 14 ? 0 : undefined);
  }
  // halls around the plaza
  const halls = [[-22, -14], [22, -14], [-22, 14], [22, 14], [-12, 18], [12, -18]];
  halls.forEach(([hx, hz], k) => {
    for (let dz = -4; dz <= 4; dz++) for (let dx = -5; dx <= 5; dx++) {
      const x = P.x + hx + dx, z = P.z + hz + dz;
      if (!W.has(x, z)) continue;
      const edge = Math.abs(dx) === 5 || Math.abs(dz) === 4;
      const ruined = hash3(x, 1, z, seed + 52) < 0.25;
      for (let y = Y + 1; y <= Y + 6; y++) {
        let id = B.AIR;
        if (edge && !(ruined && y > Y + 2)) id = y === Y + 6 ? B.DEEPSLATE_TILES : Math.abs(dx) === 5 && Math.abs(dz) === 4 ? B.POLISHED_BLACKSTONE : B.DEEPSLATE_BRICKS;
        if (y === Y + 6 && !ruined) id = B.DEEPSLATE_TILES;
        if (edge && dz === (hz > 0 ? -4 : 4) && Math.abs(dx) <= 1 && y <= Y + 3) id = B.AIR;   // door towards the plaza
        W.set(x, y, z, id);
      }
      if (!edge) W.set(x, Y, z, B.WOOL + 7);
    }
    const cx = P.x + hx, cz = P.z + hz;
    if (W.has(cx, cz + (hz > 0 ? 2 : -2))) { W.set(cx, Y + 1, cz + (hz > 0 ? 2 : -2), B.CHEST, hz > 0 ? 5 : 4); W.loot(cx, Y + 1, cz + (hz > 0 ? 2 : -2), 'ancient'); }
    if (W.has(cx - 3, cz)) W.set(cx - 3, Y + 1, cz, B.SOUL_LANTERN);
    if (W.has(cx + 3, cz)) W.set(cx + 3, Y + 1, cz, k % 2 ? B.SCULK_SHRIEKER : B.SCULK_SENSOR);
  });
  // lamp posts and shriekers along the main paths
  for (let s = -28; s <= 28; s += 8) for (const [px, pz] of [[s, 4], [s, -4]]) {
    const x = P.x + px, z = P.z + pz;
    if (!W.has(x, z) || Math.abs(px) < 8) continue;
    W.set(x, Y + 1, z, B.DEEPSLATE_WALL); W.set(x, Y + 2, z, B.DEEPSLATE_WALL); W.set(x, Y + 3, z, B.SOUL_LANTERN);
  }
  for (const [px, pz] of [[-9, 9], [9, 9], [0, -10], [-16, 0], [16, 0]]) if (W.has(P.x + px, P.z + pz)) W.set(P.x + px, Y, P.z + pz, B.SCULK_SHRIEKER);
  // soul lanterns hanging from the vault in a loose grid, and glow lichen on the outer walls:
  // the city is dim and blue, but you can find your way round it
  for (let dz = -RZ + 5; dz <= RZ - 5; dz += 7) for (let dx = -RX + 5; dx <= RX - 5; dx += 7) {
    const x = P.x + dx, z = P.z + dz;
    if (!W.has(x, z) || (Math.abs(dx) <= 7 && Math.abs(dz) <= 2)) continue;
    const edge = Math.max(Math.abs(dx) / RX, Math.abs(dz) / RZ);
    const roof = Y + 18 - Math.round(edge * edge * 8);
    const above = W.get(x, roof + 1, z);
    if (above > 0 && BLOCK_SOLID[above]) { W.set(x, roof, z, B.DEEPSLATE_WALL); W.set(x, roof - 1, z, B.SOUL_LANTERN, 8); }   // hung from the vault
    else if (W.get(x, Y + 1, z) === B.AIR) { W.set(x, Y + 1, z, B.DEEPSLATE_WALL); W.set(x, Y + 2, z, B.DEEPSLATE_WALL); W.set(x, Y + 3, z, B.SOUL_LANTERN); }   // open above: a lamp post
  }
  for (let dz = -RZ; dz <= RZ; dz++) for (let dx = -RX; dx <= RX; dx++) {
    if (Math.abs(dz) !== RZ - 1 && Math.abs(dx) !== RX - 1) continue;
    const x = P.x + dx, z = P.z + dz;
    if (W.has(x, z) && hash3(x, 3, z, seed + 53) < 0.35) W.set(x, Y + 1 + Math.floor(hash3(x, 4, z, seed) * 3), z, B.GLOW_LICHEN);
  }
  // soul fires in braziers round the plaza, so the city glows faintly in the dark
  for (let a = 0; a < 12; a++) {
    const x = P.x + Math.round(Math.cos(a / 12 * Math.PI * 2) * 13), z = P.z + Math.round(Math.sin(a / 12 * Math.PI * 2) * 11);
    if (!W.has(x, z) || Math.abs(z - P.z) <= 1) continue;
    W.set(x, Y + 1, z, B.POLISHED_BLACKSTONE); W.set(x, Y + 2, z, B.SOUL_LANTERN);
  }
}

// ------------------------------------------------------------- hooks ----
{
  const gen0 = WorldGen.prototype.generate, h0 = WorldGen.prototype.height;
  WorldGen.prototype.generate = function (chunk) {
    if (this.type === 'default') {
      const d = dimAt(chunk.cx * CS + 8, chunk.cz * CS + 8);
      if (d === DIM_NETHER) return genNether(this, chunk);
      if (d === DIM_END) return genEnd(this, chunk);
      if (d === DIM_DEEP) return genDeep(this, chunk);
    }
    return gen0.call(this, chunk);
  };
  // rough floor heights inside the dimensions (spawning, map, structure checks)
  WorldGen.prototype.height = function (x, z) {
    if (this.type === 'default') {
      const d = dimAt(x, z);
      if (d === DIM_END) { const [lx, lz] = dimLocal(d, x, z); const c = endColumn(dimNoise(this), lx, lz); return c ? c[0] : 0; }
      if (d) return d === DIM_NETHER ? 40 : 30;
    }
    return h0.call(this, x, z);
  };
}
