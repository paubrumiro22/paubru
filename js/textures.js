'use strict';
// Procedural 16x16 pixel-art textures, derived normal/smoothness maps, mip chains and UI icons.

const TS = 16;

function newTile() { return new Uint8ClampedArray(TS * TS * 4); }
function put(d, x, y, c, f = 1, a = 255) {
  const i = (((y & 15) << 4) | (x & 15)) << 2;
  d[i] = c[0] * f; d[i + 1] = c[1] * f; d[i + 2] = c[2] * f; d[i + 3] = a;
}
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// Tileable smooth value noise over the 16x16 tile.
function smoothField(rng, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const out = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) {
    const fy = (y / TS) * cells, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < TS; x++) {
      const fx = (x / TS) * cells, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * TS + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}

// Wrapped Voronoi: nearest cell id and (d2 - d1) edge distance per pixel.
function voronoi(rng, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([rng() * TS, rng() * TS]);
  const id = new Int16Array(TS * TS), edge = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < n; i++) {
      let dx = Math.abs(x + 0.5 - pts[i][0]), dy = Math.abs(y + 0.5 - pts[i][1]);
      dx = Math.min(dx, TS - dx); dy = Math.min(dy, TS - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
    }
    id[y * TS + x] = best; edge[y * TS + x] = d2 - d1;
  }
  return { id, edge };
}

function noisyFill(d, rng, base, amp, smoothAmp, cells = 4) {
  const s = smoothField(rng, cells);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    put(d, x, y, base, 1 - amp / 2 - smoothAmp / 2 + rng() * amp + s[y * TS + x] * smoothAmp);
  }
}

const TEX_GEN = {};

TEX_GEN[T.GRASS_TOP] = (d, rng) => {
  noisyFill(d, rng, [86, 142, 50], 0.26, 0.2);
  for (let i = 0; i < 256; i++) {
    const r = rng();
    if (r < 0.07) put(d, i & 15, i >> 4, [128, 188, 72], 0.95 + rng() * 0.1);
    else if (r < 0.12) put(d, i & 15, i >> 4, [62, 112, 38], 0.95 + rng() * 0.1);
  }
};

function genDirt(d, rng) {
  noisyFill(d, rng, [124, 88, 60], 0.28, 0.18);
  for (let i = 0; i < 256; i++) {
    const r = rng();
    if (r < 0.06) put(d, i & 15, i >> 4, [154, 116, 82], 0.9 + rng() * 0.15);
    else if (r < 0.12) put(d, i & 15, i >> 4, [86, 60, 42], 0.9 + rng() * 0.15);
  }
}
TEX_GEN[T.DIRT] = genDirt;

TEX_GEN[T.GRASS_SIDE] = (d, rng) => {
  genDirt(d, rng);
  for (let x = 0; x < TS; x++) {
    let depth = 2 + Math.floor(rng() * 3);
    if (rng() < 0.15) depth += 2;
    for (let y = 0; y < depth; y++) {
      const c = y === depth - 1 ? [62, 110, 38] : [86, 142, 50];
      put(d, x, y, c, 0.85 + rng() * 0.25);
    }
  }
};

function genStone(d, rng) {
  noisyFill(d, rng, [128, 128, 130], 0.14, 0.22, 3);
  for (let k = 0; k < 6; k++) {
    let x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    const len = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < len; i++) {
      put(d, x, y, [100, 100, 102], 0.95 + rng() * 0.1);
      x++; if (rng() < 0.35) y += rng() < 0.5 ? 1 : -1;
    }
  }
}
TEX_GEN[T.STONE] = genStone;

TEX_GEN[T.COBBLE] = (d, rng) => {
  const v = voronoi(rng, 10);
  const bright = [];
  for (let i = 0; i < 10; i++) bright.push(0.72 + rng() * 0.4);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = v.edge[y * TS + x];
    if (e < 1.0) put(d, x, y, [70, 70, 72], 0.85 + rng() * 0.2);
    else put(d, x, y, [134, 134, 136], bright[v.id[y * TS + x]] * (0.9 + rng() * 0.14) * (0.82 + 0.18 * Math.min(e / 3, 1)));
  }
};

TEX_GEN[T.SAND] = (d, rng) => {
  noisyFill(d, rng, [210, 194, 146], 0.12, 0.08);
  for (let i = 0; i < 256; i++) {
    const r = rng();
    if (r < 0.06) put(d, i & 15, i >> 4, [198, 182, 136]);
    else if (r < 0.09) put(d, i & 15, i >> 4, [238, 228, 190]);
  }
};

TEX_GEN[T.GRAVEL] = (d, rng) => {
  const v = voronoi(rng, 16);
  const pal = [[132, 126, 122], [104, 100, 98], [152, 142, 132], [122, 110, 100], [90, 88, 86]];
  const cols = [];
  for (let i = 0; i < 16; i++) cols.push(pal[Math.floor(rng() * pal.length)]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (v.edge[y * TS + x] < 0.8) put(d, x, y, [70, 66, 64], 0.9 + rng() * 0.2);
    else put(d, x, y, cols[v.id[y * TS + x]], 0.88 + rng() * 0.18);
  }
};

function genBark(d, rng, base, dark) {
  const col = new Float32Array(TS);
  for (let x = 0; x < TS; x++) col[x] = 0.75 + rng() * 0.35;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const f = (col[x] * 2 + col[(x + 1) & 15] + col[(x + 15) & 15]) / 4;
    put(d, x, y, base, f * (0.9 + rng() * 0.15));
  }
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(rng() * TS);
    let y = Math.floor(rng() * TS);
    const len = 4 + Math.floor(rng() * 8);
    for (let i = 0; i < len; i++) put(d, x, y + i, dark, 0.9 + rng() * 0.2);
  }
}

function genRings(d, rng, inner, outer, bark) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5);
    if (r > 6.8) put(d, x, y, bark, 0.85 + rng() * 0.25);
    else {
      const ring = 0.5 + 0.5 * Math.sin(r * 2.3 + rng() * 0.4);
      put(d, x, y, mixc(inner, outer, ring), 0.94 + rng() * 0.1);
    }
  }
}

TEX_GEN[T.LOG_SIDE] = (d, rng) => genBark(d, rng, [104, 81, 50], [62, 46, 28]);
TEX_GEN[T.LOG_TOP] = (d, rng) => genRings(d, rng, [184, 150, 98], [150, 118, 72], [104, 81, 50]);
TEX_GEN[T.SPRUCE_SIDE] = (d, rng) => genBark(d, rng, [74, 54, 34], [44, 32, 20]);
TEX_GEN[T.SPRUCE_TOP] = (d, rng) => genRings(d, rng, [158, 118, 74], [126, 92, 56], [74, 54, 34]);

TEX_GEN[T.BIRCH_SIDE] = (d, rng) => {
  noisyFill(d, rng, [220, 218, 210], 0.1, 0.08);
  for (let k = 0; k < 7; k++) {
    const y = Math.floor(rng() * TS), x = Math.floor(rng() * TS);
    const len = 2 + Math.floor(rng() * 4);
    const two = rng() < 0.4;
    for (let i = 0; i < len; i++) {
      put(d, x + i, y, [48, 44, 42], 0.9 + rng() * 0.3);
      if (two && i > 0 && i < len - 1) put(d, x + i, y + 1, [48, 44, 42], 0.9 + rng() * 0.3);
    }
  }
};
TEX_GEN[T.BIRCH_TOP] = (d, rng) => genRings(d, rng, [206, 186, 136], [178, 158, 110], [220, 218, 210]);

function genLeaves(d, rng, base, holes) {
  const s = smoothField(rng, 4);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (rng() < holes) { put(d, x, y, base, 1, 0); continue; }
    let f = 0.68 + rng() * 0.42 + (s[y * TS + x] - 0.5) * 0.3;
    if (rng() < 0.08) f *= 1.25;
    put(d, x, y, base, f);
  }
}
TEX_GEN[T.LEAVES] = (d, rng) => genLeaves(d, rng, [72, 148, 50], 0.24);
TEX_GEN[T.BIRCH_LEAVES] = (d, rng) => genLeaves(d, rng, [120, 164, 74], 0.24);
TEX_GEN[T.SPRUCE_LEAVES] = (d, rng) => genLeaves(d, rng, [58, 98, 64], 0.14);

TEX_GEN[T.PLANKS] = (d, rng) => {
  const boardF = [], joint = [];
  for (let r = 0; r < 4; r++) { boardF.push(0.88 + rng() * 0.18); joint.push((r * 5 + Math.floor(rng() * 4)) & 15); }
  const grain = smoothField(rng, 8);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = y >> 2;
    let f = boardF[row] * (0.9 + grain[(row * 4) * TS + x] * 0.14 + rng() * 0.06);
    if ((y & 3) === 3) f *= 0.68;
    if (x === joint[row] && (y & 3) !== 3) f *= 0.74;
    put(d, x, y, [178, 140, 88], f);
  }
};

TEX_GEN[T.GLASS] = (d, rng) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    const streak = (x - y === 3 && x > 4 && x < 10) || (x - y === 5 && x > 6 && x < 10) || (x - y === -6 && x > 7 && x < 11);
    if (border) put(d, x, y, [205, 228, 234], 0.9 + rng() * 0.12);
    else if (streak) put(d, x, y, [236, 248, 252]);
    else put(d, x, y, [200, 230, 240], 1, 0);
  }
};

TEX_GEN[T.SNOW_TOP] = (d, rng) => {
  noisyFill(d, rng, [240, 246, 252], 0.05, 0.06);
  for (let i = 0; i < 256; i++) if (rng() < 0.06) put(d, i & 15, i >> 4, [218, 230, 246]);
};

TEX_GEN[T.SNOW_SIDE] = (d, rng) => {
  genDirt(d, rng);
  for (let x = 0; x < TS; x++) {
    const depth = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < depth; y++) put(d, x, y, [238, 244, 250], 0.93 + rng() * 0.07);
  }
};

TEX_GEN[T.BEDROCK] = (d, rng) => {
  const pal = [[34, 34, 36], [70, 70, 72], [112, 112, 114], [52, 52, 54], [150, 150, 152]];
  const s = smoothField(rng, 5);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const k = Math.min(pal.length - 1, Math.floor((s[y * TS + x] * 0.7 + rng() * 0.3) * pal.length));
    put(d, x, y, pal[k], 0.9 + rng() * 0.2);
  }
};

function genOre(d, rng, smooth, ore, hi) {
  genStone(d, rng);
  const clusters = 4 + Math.floor(rng() * 2);
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(rng() * 12), cy = 2 + Math.floor(rng() * 12);
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const [ox, oy] = cells[i];
      const x = cx + ox, y = cy + oy;
      put(d, x, y, i === 0 ? hi : ore, 0.9 + rng() * 0.15);
      smooth[((y & 15) << 4) | (x & 15)] = 0.85;
    }
  }
}
TEX_GEN[T.COAL] = (d, rng, s) => genOre(d, rng, s, [42, 42, 44], [78, 78, 80]);
TEX_GEN[T.IRON] = (d, rng, s) => genOre(d, rng, s, [210, 168, 140], [236, 208, 184]);
TEX_GEN[T.GOLD] = (d, rng, s) => genOre(d, rng, s, [246, 204, 56], [255, 244, 150]);
TEX_GEN[T.DIAMOND] = (d, rng, s) => genOre(d, rng, s, [80, 222, 214], [200, 255, 250]);

TEX_GEN[T.SANDSTONE_SIDE] = (d, rng) => {
  for (let y = 0; y < TS; y++) {
    let f = y < 3 ? 1.05 : 0.95 + 0.05 * Math.sin(y * 1.3);
    if (y === 12) f = 0.8;
    const base = y > 12 ? [204, 188, 138] : [216, 202, 150];
    for (let x = 0; x < TS; x++) put(d, x, y, base, f * (0.95 + rng() * 0.08));
  }
};
TEX_GEN[T.SANDSTONE_TOP] = (d, rng) => noisyFill(d, rng, [220, 207, 158], 0.08, 0.06);

TEX_GEN[T.BRICKS] = (d, rng) => {
  const bf = new Float32Array(16);
  for (let i = 0; i < 16; i++) bf[i] = 0.82 + rng() * 0.28;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = y >> 2, xo = (x + (row & 1) * 4) & 15;
    if ((y & 3) === 3 || (xo & 7) === 7) put(d, x, y, [176, 168, 158], 0.9 + rng() * 0.12);
    else put(d, x, y, [150, 72, 56], bf[row * 2 + (xo >> 3)] * (0.9 + rng() * 0.16));
  }
};

TEX_GEN[T.STONE_BRICKS] = (d, rng) => {
  const bf = new Float32Array(8);
  for (let i = 0; i < 8; i++) bf[i] = 0.86 + rng() * 0.2;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = y >> 3, xo = (x + (row & 1) * 8) & 15;
    if ((y & 7) === 7 || xo === 15) put(d, x, y, [92, 92, 94], 0.9 + rng() * 0.1);
    else {
      let f = bf[row * 2 + (xo >> 3)] * (0.92 + rng() * 0.1);
      if ((y & 7) === 0 || xo === 0) f *= 1.08;
      put(d, x, y, [136, 136, 138], f);
    }
  }
  for (let i = 0; i < 4; i++) put(d, 3 + i, 10 + (i & 1), [96, 96, 98]);
};

TEX_GEN[T.CACTUS_SIDE] = (d, rng) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let f = 0.92 + rng() * 0.12;
    if (x === 1 || x === 5 || x === 10 || x === 14) f *= 0.8;
    if (x === 0 || x === 15) f *= 0.7;
    if ((x === 3 || x === 8 || x === 12) && (y & 3) === 1) put(d, x, y, [226, 226, 190]);
    else put(d, x, y, [82, 136, 52], f);
  }
};
TEX_GEN[T.CACTUS_TOP] = (d, rng) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5);
    let f = 0.92 + rng() * 0.1;
    if (r > 6) f *= 0.78; else if (r < 2.5) f *= 1.1;
    put(d, x, y, [96, 150, 60], f);
  }
};

function clearTile(d) { for (let i = 0; i < d.length; i += 4) { d[i] = 70; d[i + 1] = 120; d[i + 2] = 50; d[i + 3] = 0; } }

TEX_GEN[T.TALLGRASS] = (d, rng) => {
  clearTile(d);
  for (let b = 0; b < 10; b++) {
    const bx = 1 + rng() * 14, h = 5 + Math.floor(rng() * 10), lean = (rng() - 0.5) * 0.6;
    const c = [70 + rng() * 34, 128 + rng() * 36, 44 + rng() * 18];
    for (let i = 0; i < h; i++) {
      const x = Math.round(bx + lean * i), y = 15 - i;
      if (x < 0 || x > 15) break;
      put(d, x, y, c, 0.7 + 0.35 * (i / h));
    }
  }
};

function genFlower(d, rng, petal, center, cy, radius) {
  clearTile(d);
  for (let y = cy + 1; y < 16; y++) put(d, 7, y, [60, 128, 40], 0.9 + rng() * 0.2);
  put(d, 6, 11, [70, 140, 45]); put(d, 5, 10, [70, 140, 45]); put(d, 8, 12, [70, 140, 45]); put(d, 9, 11, [70, 140, 45]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = Math.hypot(x - 7, y - cy);
    if (r <= radius) put(d, x, y, r < 1.2 ? center : petal, 0.85 + rng() * 0.2 + (y < cy ? 0.1 : 0));
  }
}
TEX_GEN[T.ROSE] = (d, rng) => genFlower(d, rng, [206, 34, 40], [120, 14, 20], 5, 2.6);
TEX_GEN[T.DANDELION] = (d, rng) => genFlower(d, rng, [252, 222, 52], [226, 160, 24], 6, 2.2);

TEX_GEN[T.GLOWSTONE] = (d, rng) => {
  const v = voronoi(rng, 9);
  const pal = [[252, 214, 120], [236, 174, 80], [204, 142, 62], [255, 234, 170]];
  const cols = [];
  for (let i = 0; i < 9; i++) cols.push(pal[Math.floor(rng() * pal.length)]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (v.edge[y * TS + x] < 0.9) put(d, x, y, [132, 86, 42], 0.9 + rng() * 0.2);
    else if (rng() < 0.1) put(d, x, y, [255, 250, 214]);
    else put(d, x, y, cols[v.id[y * TS + x]], 0.92 + rng() * 0.12);
  }
};

TEX_GEN[T.WATER] = (d, rng) => {
  noisyFill(d, rng, [46, 98, 190], 0.12, 0.2);
  for (let i = 3; i < 1024; i += 4) d[i] = 210;
};

const TEX_SMOOTH = new Float32Array(TEX_COUNT).fill(0.1);
const TEX_BUMP = new Float32Array(TEX_COUNT).fill(1.4);
[[T.STONE, 0.22, 1.6], [T.COBBLE, 0.16, 2.6], [T.SAND, 0.06, 0.7], [T.GLASS, 0.95, 0], [T.SNOW_TOP, 0.4, 0.5],
  [T.SNOW_SIDE, 0.3, 1.0], [T.GLOWSTONE, 0.3, 1.5], [T.BRICKS, 0.14, 2.4], [T.STONE_BRICKS, 0.2, 2.4], [T.LEAVES, 0.35, 1.2],
  [T.BIRCH_LEAVES, 0.35, 1.2], [T.SPRUCE_LEAVES, 0.35, 1.2], [T.PLANKS, 0.22, 1.3], [T.DIRT, 0.04, 1.4],
  [T.GRASS_TOP, 0.14, 1.0], [T.TALLGRASS, 0.25, 0.3], [T.ROSE, 0.3, 0.3], [T.DANDELION, 0.3, 0.3],
  [T.CACTUS_SIDE, 0.3, 1.6], [T.GRAVEL, 0.1, 2.4], [T.LOG_SIDE, 0.08, 2.0], [T.SPRUCE_SIDE, 0.08, 2.0],
  [T.BIRCH_SIDE, 0.15, 1.2], [T.COAL, 0.22, 1.8], [T.IRON, 0.22, 1.8], [T.GOLD, 0.22, 1.8], [T.DIAMOND, 0.22, 1.8],
  [T.SANDSTONE_SIDE, 0.1, 1.4], [T.SANDSTONE_TOP, 0.1, 0.9], [T.BEDROCK, 0.1, 2.2]]
  .forEach(([t, s, b]) => { TEX_SMOOTH[t] = s; TEX_BUMP[t] = b; });

function isCutoutLayer(t) {
  return t === T.LEAVES || t === T.BIRCH_LEAVES || t === T.SPRUCE_LEAVES || t === T.GLASS ||
    t === T.TALLGRASS || t === T.ROSE || t === T.DANDELION;
}

// Replace colour of transparent texels with the tile's mean opaque colour (avoids dark fringes).
function bleedTransparent(d) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  if (!n) return;
  r /= n; g /= n; b /= n;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] <= 127) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
}

function coverage(d, scale) {
  let c = 0;
  for (let i = 3; i < d.length; i += 4) if (Math.min(255, d[i] * scale) > 127) c++;
  return c / (d.length / 4);
}

// Build a mip chain; cutout layers keep their alpha-test coverage at every level.
function buildMips(tile, cutout) {
  const levels = [tile];
  const c0 = cutout ? coverage(tile, 1) : 0;
  let size = TS, src = tile;
  while (size > 1) {
    const ns = size >> 1, dst = new Uint8ClampedArray(ns * ns * 4);
    for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((y * 2 + dy) * size + (x * 2 + dx)) * 4;
        const wt = src[i + 3] + 1;
        r += src[i] * wt; g += src[i + 1] * wt; b += src[i + 2] * wt; a += src[i + 3]; w += wt;
      }
      const o = (y * ns + x) * 4;
      dst[o] = r / w; dst[o + 1] = g / w; dst[o + 2] = b / w; dst[o + 3] = a / 4;
    }
    if (cutout && c0 > 0) {
      let lo = 0, hi = 8;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) / 2;
        if (coverage(dst, mid) < c0) lo = mid; else hi = mid;
      }
      for (let i = 3; i < dst.length; i += 4) dst[i] = Math.min(255, dst[i] * hi);
    }
    levels.push(dst);
    src = dst; size = ns;
  }
  return levels;
}

// Tangent-space normal map from luminance height; alpha stores smoothness.
function buildNormalMap(tile, smooth, bump) {
  const h = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = tile[i * 4 + 3];
    h[i] = a > 127 ? (0.299 * tile[i * 4] + 0.587 * tile[i * 4 + 1] + 0.114 * tile[i * 4 + 2]) / 255 : 0.5;
  }
  const out = new Uint8ClampedArray(1024);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = h[y * TS + ((x + 1) & 15)] - h[y * TS + ((x + 15) & 15)];
    const dy = h[((y + 1) & 15) * TS + x] - h[((y + 15) & 15) * TS + x];
    let nx = -dx * bump, ny = -dy * bump, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const i = (y * TS + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255;
    out[i + 3] = smooth[y * TS + x] * 255;
  }
  return out;
}

// Generates everything: returns { albedoLevels[level] = Uint8Array(all layers), normal (level 0), tiles }.
function generateTextures(seed) {
  const tiles = [], normals = [], mipsPerLayer = [];
  for (let t = 0; t < TEX_COUNT; t++) {
    const rng = mulberry32((seed * 7919 + t * 104729) | 0);
    const d = newTile();
    const smooth = new Float32Array(256).fill(TEX_SMOOTH[t]);
    const gen = TEX_GEN[t];
    if (gen) gen(d, rng, smooth); else noisyFill(d, rng, [255, 0, 255], 0, 0);
    const cut = isCutoutLayer(t);
    if (cut) bleedTransparent(d);
    tiles.push(d);
    normals.push(buildNormalMap(d, smooth, TEX_BUMP[t]));
    mipsPerLayer.push(buildMips(d, cut));
  }
  const levels = [];
  for (let l = 0, size = TS; size >= 1; l++, size >>= 1) {
    const buf = new Uint8Array(size * size * 4 * TEX_COUNT);
    for (let t = 0; t < TEX_COUNT; t++) buf.set(mipsPerLayer[t][l], t * size * size * 4);
    levels.push({ size, data: buf });
  }
  const normalBuf = new Uint8Array(1024 * TEX_COUNT);
  for (let t = 0; t < TEX_COUNT; t++) normalBuf.set(normals[t], t * 1024);
  return { tiles, levels, normal: normalBuf };
}

// Isometric block icon for the UI.
function makeBlockIcon(tiles, id, size = 48) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const tileCanvas = (layer) => {
    const c = document.createElement('canvas');
    c.width = c.height = TS;
    const img = new ImageData(new Uint8ClampedArray(tiles[layer]), TS, TS);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
  const s = size / 48;
  const rt = BLOCK_RT[id];
  if (rt === RT_CROSS) {
    ctx.drawImage(tileCanvas(BLOCK_TEX[id * 6 + 2]), 4 * s, 4 * s, 40 * s, 40 * s);
    return cv;
  }
  const top = tileCanvas(BLOCK_TEX[id * 6 + 2]);
  const left = tileCanvas(BLOCK_TEX[id * 6 + 4]);
  const right = tileCanvas(BLOCK_TEX[id * 6 + 0]);
  const face = (img, a, b, c, d, e, f, shade) => {
    ctx.setTransform(a * s, b * s, c * s, d * s, e * s, f * s);
    ctx.drawImage(img, 0, 0);
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, 0, TS, TS);
    }
  };
  face(top, 21 / 16, -11 / 16, 21 / 16, 11 / 16, 3, 13, 0);
  face(left, 21 / 16, 11 / 16, 0, 22 / 16, 3, 13, 0.28);
  face(right, 21 / 16, -11 / 16, 0, 22 / 16, 24, 24, 0.45);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}
