'use strict';
// Themed worlds. Typing a place into the seed box ("playa paradisíaca", "volcán", "oasis"...)
// builds a hand-shaped landscape around the spawn point, picks a flattering time of day and
// puts the player where the view is best. Each preset shapes height, column materials,
// liquids, plants and trees; world.js runs the shared pipeline (caves, ores, lighting).

function normText(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

const lerpN = (a, b, t) => a + (b - a) * t;
const TROPIC_TINT = [[0.74, 1.16, 0.5], [0.68, 1.12, 0.48]];
const LUSH_TINT = [[0.72, 1.08, 0.6], [0.66, 1.04, 0.58]];
const MEADOW_TINT = [[0.84, 1.1, 0.56], [0.78, 1.06, 0.56]];
const DRY_TINT = [[1.08, 0.94, 0.56], [1.0, 0.92, 0.58]];
const COLD_TINT = [[0.72, 0.9, 0.86], [0.68, 0.88, 0.84]];

function col(o) {
  return Object.assign({ top: B.GRASS, filler: B.DIRT, depth: 3, under: 0, underDepth: 0, stone: B.STONE, band: null,
    liquid: B.WATER, level: SEA, ice: false, tint: LUSH_TINT, biome: BIOME.PLAINS }, o);
}
function flowerAt(r) { return [B.ROSE, B.DANDELION, B.TULIP, B.BLUEBELL][Math.floor(r * 997) % 4]; }
function coast(g, x, z) { return x + g.nHill.fbm2(z * 0.005, 3.7, 2) * 45 + g.nDet.fbm2(x * 0.015, z * 0.015, 2) * 7; }
// a pond with sloping banks: returns { floor, bank, inside }
function pond(g, x, z, ox, oz, rad) {
  const a = Math.atan2(z - oz, x - ox);
  const r = Math.hypot(x - ox, z - oz) * (1 + g.nPatch.fbm2(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4, 2) * 0.18);
  return { r, t: r / rad };
}

const VOLC = { x: -110, z: 0, R: 92, Rc: 13, peak: 116, crater: 97, lava: 100 };
function volcR(g, x, z) {
  const dx = x - VOLC.x, dz = z - VOLC.z, a = Math.atan2(dz, dx);
  return { r: Math.hypot(dx, dz) * (1 + g.nPeak.fbm2(Math.cos(a) * 1.3 + 7, Math.sin(a) * 1.3, 2) * 0.1), a };
}
function volcBase(g, x, z) { return SEA + 7 + g.nHill.fbm2(x * 0.008, z * 0.008, 3) * 5 + g.nDet.fbm2(x * 0.03, z * 0.03, 2) * 1.5; }
function volcChannel(r, a) {
  if (r < VOLC.Rc - 1 || r > VOLC.R * 0.92) return false;
  for (let i = 0; i < 3; i++) {
    const ai = [0.25, 2.3, 4.2][i] + Math.sin(r * 0.07 + i * 2) * 0.18;
    let d = Math.abs(a - ai) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d * r < 1.4) return true;
  }
  return false;
}
// a spot on the sand a few blocks from the water line, on the z = 0 line
function beachSpawnX(g) {
  if (g._beachX !== undefined) return g._beachX;
  let x = 120;
  while (x > -120 && coast(g, x, 0) > 5) x--;
  while (x < 120 && WORLD_PRESETS.beach.height(g, x, 0) < SEA + 1) x++;
  g._beachX = x + 2;
  return g._beachX;
}
function canyonPath(g, x, z) { return z - (Math.sin(x * 0.018) * 22 + g.nHill.fbm2(x * 0.006, 1.3, 2) * 26); }
const CANYON_W = 46;
const CANYON_BANDS = [B.TERRACOTTA, B.TERRACOTTA_C, B.TERRACOTTA_C, B.TERRACOTTA_C + 1, B.TERRACOTTA, B.TERRACOTTA_C + 2,
  B.TERRACOTTA_C + 3, B.TERRACOTTA_C + 4, B.TERRACOTTA_C, B.TERRACOTTA, B.TERRACOTTA_C + 1, B.TERRACOTTA_C + 4];

const WORLD_PRESETS = {
  beach: {
    name: 'Paradise beach', icon: '🏝️', words: ['playa', 'paradis', 'beach', 'tropic', 'caribe', 'costa', 'coast'], time: 0.31,
    height(g, x, z) {
      const d = coast(g, x, z);
      let h;
      if (d < 0) {
        h = SEA + 1 + d * 0.11;
        const isl = g.nPeak.fbm2(x * 0.011 + 5, z * 0.011, 3);
        if (d < -60 && isl > 0.3) h = Math.max(h, SEA - 2 + Math.min(10, (isl - 0.3) * 50));
        h = Math.max(h, SEA - 18);
      } else {
        h = SEA + 1 + Math.min(d, 16) * 0.07 + smoothstep(16, 70, d) * (7 + g.nHill.fbm2(x * 0.009, z * 0.009, 3) * 9)
          + g.nDet.fbm2(x * 0.05, z * 0.05, 2) * 1.2 * smoothstep(10, 30, d);
      }
      return Math.floor(h);
    },
    column(g, x, z, h) {
      const d = coast(g, x, z);
      if (h <= SEA + 2 || d < 18) return col({ top: B.WHITE_SAND, filler: B.WHITE_SAND, depth: 4, under: B.SANDSTONE, underDepth: 4, tint: TROPIC_TINT, biome: h < SEA - 2 ? BIOME.OCEAN : BIOME.BEACH });
      return col({ tint: TROPIC_TINT, biome: BIOME.FOREST });
    },
    plant(g, x, z, h, ground, r) {
      if (ground === B.WHITE_SAND && h < SEA - 1 && h > SEA - 12 && r < 0.05) return { ids: r < 0.012 ? [B.CORAL + Math.floor(r * 300) % 3, B.CORAL + Math.floor(r * 700) % 3] : [B.CORAL + Math.floor(r * 300) % 3], water: true };
      if (ground === B.GRASS) {
        if (r < 0.04) return { ids: [flowerAt(r)] };
        if (r < 0.34) return { ids: [r < 0.12 ? B.FERN : B.TALLGRASS] };
      }
      return null;
    },
    trees: { cell: 5, R: 9 },
    tree(g, x, z, h, r) {
      if (h < SEA + 1) return null;
      const d = coast(g, x, z);
      if (Math.hypot(x - beachSpawnX(g), z) < 9) return null; // keep the spawn beach open
      if (d < 3) return null;
      if (d < 22) return r < 0.55 ? { kind: 'palm', dir: Math.PI + (r - 0.27) * 2 } : null;
      if (r < 0.3) return { kind: 'palm' };
      if (r < 0.62) return { kind: 'oak' };
      if (r < 0.75) return { kind: 'birch' };
      return null;
    },
    spawn(g) {
      const x = beachSpawnX(g);
      return { pos: [x + 0.5, this.height(g, x, 0) + 1, 0.5], yaw: Math.PI / 2 + 0.45, pitch: -0.08 };
    },
  },

  volcano: {
    name: 'Volcano', icon: '🌋', words: ['volcan', 'volcano', 'lava', 'magma', 'erupcion', 'eruption'], time: 0.483,
    height(g, x, z) {
      const b = volcBase(g, x, z);
      const { r, a } = volcR(g, x, z);
      if (r >= VOLC.R) {
        let h = b;
        if (r > VOLC.R * 1.05 && g.nPatch.noise2D(x * 0.045, z * 0.045) > 0.72) h -= 1;
        return Math.floor(h);
      }
      const t = 1 - r / VOLC.R;
      let h = b + (VOLC.peak - b) * Math.pow(t, 1.35) + g.nDet.fbm2(x * 0.06, z * 0.06, 2) * 2.5 * t;
      if (r < VOLC.Rc) {
        const rim = b + (VOLC.peak - b) * Math.pow(1 - VOLC.Rc / VOLC.R, 1.35);
        h = VOLC.crater + Math.pow(r / VOLC.Rc, 3) * (rim - VOLC.crater);
      } else if (volcChannel(r, a)) h -= 1;
      return Math.floor(Math.min(CH - 10, h));
    },
    column(g, x, z, h, slope) {
      const { r, a } = volcR(g, x, z);
      if (r < VOLC.Rc) return col({ top: r < VOLC.Rc - 3 ? B.MAGMA : B.BASALT, filler: B.BASALT, depth: 6, liquid: B.LAVA, level: VOLC.lava, tint: DRY_TINT, biome: BIOME.MOUNTAIN });
      if (r < VOLC.R * 0.9 && volcChannel(r, a)) return col({ top: B.MAGMA, filler: B.BASALT, depth: 5, liquid: B.LAVA, level: h + 1, tint: DRY_TINT, biome: BIOME.MOUNTAIN });
      if (r < VOLC.R * 0.85) {
        const patch = g.nPatch.noise2D(x * 0.05, z * 0.05);
        const top = patch > 0.55 ? B.OBSIDIAN : hash3(x, h, z, 71) < 0.06 ? B.MAGMA : slope > 3 ? B.BASALT : (patch < -0.4 ? B.ASH : B.BASALT);
        return col({ top, filler: B.BASALT, depth: 6, tint: DRY_TINT, biome: BIOME.MOUNTAIN });
      }
      if (r < VOLC.R * 1.15) return col({ top: B.ASH, filler: B.ASH, depth: 3, under: B.BASALT, underDepth: 3, tint: DRY_TINT, biome: BIOME.MOUNTAIN });
      if (g.nPatch.noise2D(x * 0.045, z * 0.045) > 0.72) return col({ top: B.MAGMA, filler: B.BASALT, depth: 3, liquid: B.LAVA, level: h + 1, tint: DRY_TINT });
      if (g.nPatch.noise2D(x * 0.045, z * 0.045) > 0.64) return col({ top: B.BASALT, filler: B.BASALT, depth: 2, tint: DRY_TINT });
      return col({ tint: DRY_TINT });
    },
    plant(g, x, z, h, ground, r) {
      if ((ground === B.ASH || ground === B.GRASS) && r < 0.03) return { ids: [B.DEAD_BUSH] };
      if (ground === B.GRASS && r < 0.14) return { ids: [B.TALLGRASS] };
      return null;
    },
    trees: { cell: 6, R: 4 },
    tree(g, x, z, h, r) {
      const { r: rr } = volcR(g, x, z);
      if (rr < VOLC.R * 0.9 || (Math.abs(x - (VOLC.x + VOLC.R + 24)) < 7 && Math.abs(z - 18) < 7)) return null;
      if (r < 0.1) return { kind: 'dead' };
      if (rr > VOLC.R * 1.4 && r < 0.16) return { kind: 'oak' };
      return null;
    },
    spawn(g) {
      const x = VOLC.x + VOLC.R + 24, z = 18;
      return { pos: [x + 0.5, this.height(g, x, z) + 1, z + 0.5], yaw: Math.PI / 2 - 0.15, pitch: 0.2 };
    },
    ambient(dt, p) {
      // smoke plume over the crater and ash drifting down around the player
      const w = G.world;
      if (w.isLoaded(VOLC.x, VOLC.z) || Math.hypot(p[0] - VOLC.x, p[2] - VOLC.z) < G.settings.renderDistance * CS + 40) {
        for (let i = 0; i < 2; i++) if (Math.random() < dt * 16) Particles.plume(VOLC.x + rand(-5, 5), VOLC.crater + 8, VOLC.z + rand(-5, 5));
      }
      if (Math.random() < dt * 12) Particles.ash(p[0] + rand(-10, 10), p[1] + rand(4, 9), p[2] + rand(-10, 10));
    },
  },

  oasis: {
    name: 'Desert oasis', icon: '🐪', words: ['oasis', 'desierto', 'desert', 'duna', 'dune', 'sahara'], time: 0.13,
    height(g, x, z) {
      const dunes = SEA + 9 + Math.pow(1 - Math.abs(g.nPeak.fbm2(x * 0.011 + z * 0.005, z * 0.018, 3)), 2) * 13 + g.nHill.fbm2(x * 0.006, z * 0.006, 2) * 5;
      const { r } = pond(g, x, z, 0, -34, 15);
      if (r < 15) return Math.floor(SEA + 5 - (1 - r / 15) * 4);
      if (r < 34) return Math.floor(lerpN(SEA + 8, dunes, smoothstep(15, 34, r)));
      return Math.floor(dunes);
    },
    column(g, x, z, h) {
      const { r } = pond(g, x, z, 0, -34, 15);
      if (r < 15) return col({ top: B.SAND, filler: B.CLAY, depth: 2, level: SEA + 7, tint: TROPIC_TINT, biome: BIOME.DESERT });
      if (r < 25 && h <= SEA + 10) return col({ tint: TROPIC_TINT, biome: BIOME.PLAINS });
      return col({ top: B.SAND, filler: B.SAND, depth: 4, under: B.SANDSTONE, underDepth: 6, tint: DRY_TINT, biome: BIOME.DESERT });
    },
    plant(g, x, z, h, ground, r) {
      const { r: pr } = pond(g, x, z, 0, -34, 15);
      if (ground === B.GRASS) {
        if (pr < 17.5 && r < 0.3) return { ids: [B.SUGAR_CANE, B.SUGAR_CANE].slice(0, 1 + Math.floor(r * 7) % 2) };
        if (r < 0.1) return { ids: [flowerAt(r)] };
        if (r < 0.45) return { ids: [B.TALLGRASS] };
      }
      if (ground === B.SAND && h > SEA + 7) {
        if (r < 0.005) return { ids: [B.CACTUS, B.CACTUS, B.CACTUS].slice(0, 1 + Math.floor(r * 999) % 3) };
        if (r < 0.015) return { ids: [B.DEAD_BUSH] };
      }
      return null;
    },
    trees: { cell: 5, R: 9 },
    tree(g, x, z, h, r) {
      const { r: pr } = pond(g, x, z, 0, -34, 15);
      if (pr < 16 || pr > 28) return null;
      if (Math.abs(x) < 3 && Math.abs(z + 12) < 4) return null;
      return r < 0.6 ? { kind: 'palm' } : null;
    },
    spawn(g) { return { pos: [0.5, this.height(g, 0, -11) + 1, -10.5], yaw: 0, pitch: -0.12 }; },
  },

  peaks: {
    name: 'Snowy peaks', icon: '🏔️', words: ['nieve', 'nevad', 'montana', 'snow', 'mountain', 'hielo', 'glaciar', 'alpes', 'peak', 'pico'], time: 0.09,
    height(g, x, z) {
      const r = Math.hypot(x, z);
      if (r < 20) return Math.floor(SEA + 2 - (1 - r / 20) * 3);
      const m = smoothstep(26, 110, r);
      const ridge = 1 - Math.abs(g.nPeak.fbm2(x * 0.009, z * 0.009, 4));
      return Math.floor(Math.min(CH - 10, SEA + 5 + g.nHill.fbm2(x * 0.01, z * 0.01, 3) * 4 * smoothstep(20, 40, r) + m * (Math.pow(ridge, 2.2) * 62 + 12) + smoothstep(20, 30, r) * 2));
    },
    column(g, x, z, h, slope) {
      const r = Math.hypot(x, z);
      if (r < 20) return col({ top: B.GRAVEL, filler: B.SAND, depth: 2, level: SEA + 4, ice: true, tint: COLD_TINT, biome: BIOME.SNOWY });
      if (h > SEA + 40) return col({ top: B.SNOW, filler: B.SNOW, depth: 2, tint: COLD_TINT, biome: BIOME.MOUNTAIN });
      if (slope > 3) return col({ top: B.STONE, filler: B.STONE, tint: COLD_TINT, biome: BIOME.MOUNTAIN });
      return col({ top: B.SNOWY_GRASS, tint: COLD_TINT, biome: BIOME.SNOWY });
    },
    plant(g, x, z, h, ground, r) { return ground === B.SNOWY_GRASS && r < 0.08 ? { ids: [B.FERN] } : null; },
    trees: { cell: 5, R: 4 },
    tree(g, x, z, h, r) {
      const rr = Math.hypot(x, z);
      if (rr < 23 || h > SEA + 36 || (Math.abs(x) < 4 && z > 22 && z < 32)) return null;
      return r < 0.55 ? { kind: 'spruce' } : null;
    },
    spawn(g) { return { pos: [0.5, this.height(g, 0, 26) + 1, 26.5], yaw: 0, pitch: 0.14 }; },
  },

  forest: {
    name: 'Ancient forest', icon: '🌳', words: ['bosque', 'selva', 'jungla', 'forest', 'jungle', 'arbol', 'tree', 'encantad'], time: 0.21,
    height(g, x, z) { return Math.floor(SEA + 8 + g.nHill.fbm2(x * 0.012, z * 0.012, 3) * 7 + g.nDet.fbm2(x * 0.05, z * 0.05, 2) * 1.5); },
    column() { return col({ tint: LUSH_TINT, biome: BIOME.FOREST }); },
    plant(g, x, z, h, ground, r) {
      if (ground !== B.GRASS) return null;
      if (r < 0.22) return { ids: [B.FERN] };
      if (r < 0.4) return { ids: [B.TALLGRASS] };
      if (r < 0.43) return { ids: [r < 0.415 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM] };
      if (r < 0.47) return { ids: [B.BLUEBELL] };
      if (r < 0.49) return { ids: [B.ROSE] };
      return null;
    },
    trees: { cell: 6, R: 10 },
    tree(g, x, z, h, r) {
      if (Math.hypot(x, z) < 10) return null;
      if (r < 0.32) return { kind: 'giant' };
      if (r < 0.7) return { kind: 'oak' };
      if (r < 0.9) return { kind: 'birch' };
      return null;
    },
    spawn(g) { return { pos: [0.5, this.height(g, 0, 0) + 1, 0.5], yaw: 0.7, pitch: 0.22 }; },
    ambient(dt, p) { if (!isDaytime() && Math.random() < dt * 6) Particles.firefly(p[0] + rand(-12, 12), p[1] + rand(0, 4), p[2] + rand(-12, 12)); },
  },

  canyon: {
    name: 'Red canyon', icon: '🏜️', words: ['canon', 'canyon', 'mesa', 'barranco', 'garganta', 'rojo'], time: 0.42,
    height(g, x, z) {
      const s = Math.abs(canyonPath(g, x, z));
      const top = SEA + 42 + g.nDet.fbm2(x * 0.02, z * 0.02, 2) * 2;
      if (s < 6) return SEA + 1;
      if (s < CANYON_W) {
        if (g.nPatch.noise2D(x * 0.05, z * 0.05) > 0.74 && s > 12 && Math.abs(x) > 14) return Math.floor(top - 3);
        const t = (s - 6) / (CANYON_W - 6);
        const steps = 5;
        return Math.floor(SEA + 2 + Math.floor(Math.pow(t, 0.85) * steps) * (40 / steps) + g.nDet.fbm2(x * 0.08, z * 0.08, 2));
      }
      return Math.floor(top);
    },
    column(g, x, z, h) {
      const s = Math.abs(canyonPath(g, x, z));
      const off = Math.floor(g.nPatch.fbm2(x * 0.01, z * 0.01, 2) * 3);
      const band = (y) => (y > SEA - 6 ? CANYON_BANDS[((Math.floor((y + off) / 2) % CANYON_BANDS.length) + CANYON_BANDS.length) % CANYON_BANDS.length] : 0);
      if (s < 6) return col({ top: B.SAND, filler: B.SAND, depth: 2, level: SEA + 3, band, tint: DRY_TINT, biome: BIOME.DESERT });
      const flat = s > CANYON_W || h > SEA + 38;
      return col({ top: flat ? B.RED_SAND : band(h) || B.TERRACOTTA, filler: flat ? B.RED_SAND : band(h - 1) || B.TERRACOTTA, depth: flat ? 2 : 1, band, tint: DRY_TINT, biome: BIOME.DESERT });
    },
    plant(g, x, z, h, ground, r) {
      if (ground === B.RED_SAND || ground === B.SAND) {
        if (r < 0.006) return { ids: [B.CACTUS, B.CACTUS].slice(0, 1 + Math.floor(r * 999) % 2) };
        if (r < 0.03) return { ids: [B.DEAD_BUSH] };
      }
      return null;
    },
    trees: { cell: 7, R: 4 },
    tree(g, x, z, h, r) { return r < 0.04 && Math.abs(canyonPath(g, x, z)) > CANYON_W ? { kind: 'dead' } : null; },
    spawn(g) {
      const zc = Math.sin(0) * 22 + g.nHill.fbm2(0, 1.3, 2) * 26;
      const z = Math.round(zc + CANYON_W + 5);
      return { pos: [0.5, this.height(g, 0, z) + 1, z + 0.5], yaw: 0, pitch: -0.28 };
    },
  },

  islands: {
    name: 'Archipelago', icon: '⛵', words: ['isla', 'island', 'archipielago', 'archipelago', 'atolon', 'atoll'], time: 0.36,
    height(g, x, z) {
      const isl = g.nPeak.fbm2(x * 0.014, z * 0.014, 3) + Math.max(0, 1 - Math.hypot(x, z) / 45) * 0.8 - 0.28;
      if (isl <= 0) return Math.floor(SEA - 12 + g.nDet.fbm2(x * 0.02, z * 0.02, 2) * 3 + isl * 6);
      return Math.floor(SEA - 3 + Math.min(isl * 55, 22) + g.nHill.fbm2(x * 0.03, z * 0.03, 2) * isl * 6);
    },
    column(g, x, z, h) {
      if (h <= SEA + 2) return col({ top: B.WHITE_SAND, filler: B.WHITE_SAND, depth: 4, under: B.SANDSTONE, underDepth: 3, tint: TROPIC_TINT, biome: h < SEA - 2 ? BIOME.OCEAN : BIOME.BEACH });
      return col({ tint: TROPIC_TINT, biome: BIOME.FOREST });
    },
    plant(g, x, z, h, ground, r) { return WORLD_PRESETS.beach.plant(g, x, z, h, ground, r); },
    trees: { cell: 5, R: 9 },
    tree(g, x, z, h, r) {
      if (h < SEA + 1) return null;
      if (h <= SEA + 3) return r < 0.5 ? { kind: 'palm' } : null;
      return r < 0.35 ? { kind: 'palm' } : r < 0.65 ? { kind: 'oak' } : null;
    },
    spawn(g) {
      let x = 0;
      while (x > -120 && this.height(g, x, 0) > SEA + 1) x--;
      x += 4;
      return { pos: [x + 0.5, this.height(g, x, 0) + 1, 0.5], yaw: Math.PI / 2, pitch: -0.08 };
    },
  },

  meadow: {
    name: 'Flower meadow', icon: '🌸', words: ['flor', 'pradera', 'meadow', 'flower', 'jardin', 'garden', 'primavera', 'spring', 'prado'], time: 0.14,
    height(g, x, z) {
      const hills = SEA + 9 + g.nHill.fbm2(x * 0.008, z * 0.008, 3) * 8 + g.nDet.fbm2(x * 0.03, z * 0.03, 2) * 1.5;
      const { r } = pond(g, x, z, 38, 6, 13);
      if (r < 13) return Math.floor(SEA + 5 - (1 - r / 13) * 3);
      if (r < 26) return Math.floor(lerpN(SEA + 8, hills, smoothstep(13, 26, r)));
      return Math.floor(hills);
    },
    column(g, x, z) {
      const { r } = pond(g, x, z, 38, 6, 13);
      if (r < 13) return col({ top: B.SAND, filler: B.CLAY, depth: 2, level: SEA + 7, tint: MEADOW_TINT });
      return col({ tint: MEADOW_TINT });
    },
    plant(g, x, z, h, ground, r) {
      if (ground !== B.GRASS) return null;
      // flowers grow in drifts of one colour
      const drift = g.nPatch.noise2D(x * 0.04, z * 0.04);
      const kind = drift < -0.3 ? B.BLUEBELL : drift < 0.05 ? B.DANDELION : drift < 0.4 ? B.TULIP : B.ROSE;
      if (r < 0.42) return { ids: [r < 0.08 ? flowerAt(r) : kind] };
      if (r < 0.64) return { ids: [B.TALLGRASS] };
      return null;
    },
    trees: { cell: 6, R: 4 },
    tree(g, x, z, h, r) {
      if (Math.hypot(x, z) < 8 || pond(g, x, z, 38, 6, 13).r < 15) return null;
      return r < 0.12 ? { kind: 'birch' } : r < 0.17 ? { kind: 'oak' } : null;
    },
    spawn(g) { return { pos: [0.5, this.height(g, 0, 0) + 1, 0.5], yaw: -Math.PI / 2 + 0.2, pitch: -0.1 }; },
    ambient(dt, p) { if (!isDaytime() && Math.random() < dt * 5) Particles.firefly(p[0] + rand(-12, 12), p[1] + rand(0, 3), p[2] + rand(-12, 12)); },
  },
};

// Returns the preset key matching a seed text, or null.
function presetFromText(text) {
  const t = normText(text);
  if (!t) return null;
  for (const [k, p] of Object.entries(WORLD_PRESETS)) if (p.words.some((w) => t.includes(w))) return k;
  return null;
}
