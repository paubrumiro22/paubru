'use strict';
// Textures, recipes, drops and fuel for the extra blocks of blocks_extra.js.

// ---- painters shared by several blocks ----
// Re-paint another texture and pull it towards its average colour (polished stone).
function polishOf(name, keep, hi = 1.1, lo = 0.78) {
  return (d, rng, ctx) => {
    TEX_GEN[name](d, rng, ctx);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = TSS;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r / n + (d[i] - r / n) * keep; d[i + 1] = g / n + (d[i + 1] - g / n) * keep; d[i + 2] = b / n + (d[i + 2] - b / n) * keep;
    }
    bevelFrame(d, 0, 0, TM, TM, hi, lo);
    bevelFrame(d, 1, 1, TM - 1, TM - 1, 1.03, 0.92);
  };
}
function noiseFill(d, rng, base, amp = 0.2, cells = 4, steps = 16) {
  const f = fbm(rng, cells, 3);
  fillTile(d, (x, y, k) => put(d, x, y, base, quant(1 - amp / 2 + f[k] * amp + rng() * 0.04, steps)));
}
// Running-bond bricks of bw x bh pixels.
function brickWall(d, rng, base, mortar, bw = 16, bh = 8, vary = 0.22) {
  const rows = TS / bh, cols = TS / bw;
  const tone = Array.from({ length: rows * cols + cols }, () => 1 - vary / 2 + rng() * vary);
  const f = fbm(rng, 8, 2);
  fillTile(d, (x, y, k) => {
    const row = Math.floor(y / bh), ry = y % bh, xo = (x + (row & 1) * (bw >> 1)) & TM, rx = xo % bw;
    if (ry === bh - 1 || rx === bw - 1) { put(d, x, y, mortar, 0.9 + rng() * 0.12); return; }
    let fa = tone[row * cols + Math.floor(xo / bw)] * (0.9 + f[k] * 0.14 + rng() * 0.06);
    if (ry === 0 || rx === 0) fa *= 1.1;
    if (ry === bh - 2 || rx === bw - 2) fa *= 0.85;
    put(d, x, y, base, quant(fa, 14));
  });
}
// A grid of n x n square tiles; colorOf(i, j) gives each tile's colour.
function tileGrid(d, rng, n, colorOf, grout, gw = 1) {
  const s = TS / n;
  const f = fbm(rng, 4, 2);
  fillTile(d, (x, y, k) => {
    const i = Math.floor(x / s), j = Math.floor(y / s), rx = x % s, ry = y % s;
    if (rx < gw || ry < gw) { put(d, x, y, grout, 0.92 + rng() * 0.1); return; }
    let fa = 0.95 + f[k] * 0.08;
    if (rx === gw || ry === gw) fa *= 1.1;
    if (rx === s - 1 || ry === s - 1) fa *= 0.86;
    put(d, x, y, colorOf(i, j), quant(fa, 20));
  });
}
function sandstoneSide(d, rng, base, band) {
  const f = fbm(rng, 3, 2, 0.5, 6);
  fillTile(d, (x, y, k) => {
    let c = base, fa = 0.95 + f[k] * 0.08 + 0.03 * Math.sin(y * 1.3);
    if (y < 5) fa *= 1.05;
    if (y === 5) fa *= 0.82;
    if (y > 24) { c = band; if (y === 25) fa *= 0.84; }
    put(d, x, y, c, quant(fa * (0.97 + rng() * 0.05), 20));
  });
}

// ---- woods ----
gen('dark_oak_side', (d, rng) => genBark(d, rng, [70, 52, 34], [36, 26, 16]), { smooth: 0.08, bump: 2.4 });
gen('dark_oak_top', (d, rng) => genRings(d, rng, [110, 80, 50], [84, 60, 36], [60, 44, 28]), { smooth: 0.1, bump: 1.4 });
gen('dark_oak_planks', (d, rng) => genPlanks(d, rng, [96, 66, 40]), { smooth: 0.26, bump: 1.4 });
gen('dark_oak_leaves', (d, rng) => genLeaves(d, rng, [58, 104, 38], 1.2), { smooth: 0.35, bump: 1.2 });
gen('cherry_side', (d, rng) => {
  genBark(d, rng, [74, 42, 50], [42, 22, 30]);
  for (let y = 3; y < TS; y += 8) for (let x = 0; x < TS; x++) if ((x + y) % 5) put(d, x, y, [102, 62, 70], 0.9 + rng() * 0.15);
}, { smooth: 0.1, bump: 2 });
gen('cherry_top', (d, rng) => genRings(d, rng, [226, 170, 168], [200, 140, 140], [74, 42, 50]), { smooth: 0.1, bump: 1.4 });
gen('cherry_planks', (d, rng) => genPlanks(d, rng, [226, 172, 164]), { smooth: 0.28, bump: 1.4 });
gen('cherry_leaves', (d, rng) => {
  genLeaves(d, rng, [238, 160, 196], 1.05);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    if (alphaAt(d, x, y) > 0) put(d, x, y, rng() < 0.5 ? [252, 214, 232] : [214, 110, 160]);
  }
}, { smooth: 0.35, bump: 1.1 });
gen('acacia_side', (d, rng) => genBark(d, rng, [104, 98, 88], [64, 58, 52]), { smooth: 0.08, bump: 2.2 });
gen('acacia_top', (d, rng) => genRings(d, rng, [196, 104, 56], [168, 86, 44], [104, 98, 88]), { smooth: 0.1, bump: 1.4 });
gen('acacia_planks', (d, rng) => genPlanks(d, rng, [184, 98, 54]), { smooth: 0.26, bump: 1.4 });
gen('acacia_leaves', (d, rng) => genLeaves(d, rng, [110, 140, 44], 0.85), { smooth: 0.35, bump: 1.2 });
gen('bamboo_planks', (d, rng) => {
  // split bamboo laid in vertical strips with knots
  const tone = Array.from({ length: 8 }, () => 0.9 + rng() * 0.18);
  const knot = Array.from({ length: 8 }, () => Math.floor(rng() * TS));
  fillTile(d, (x, y) => {
    const s = x >> 2, rx = x & 3;
    let fa = tone[s] * (rx === 0 ? 0.72 : rx === 1 ? 1.08 : 1);
    if (Math.abs(y - knot[s]) < 1) fa *= 0.78;
    put(d, x, y, [214, 196, 106], quant(fa * (0.96 + rng() * 0.06), 14));
  });
}, { smooth: 0.3, bump: 1.4 });
gen('cherry_sapling', (d, rng) => genSapling(d, rng, [74, 42, 50], [238, 160, 196], false), { smooth: 0.3, bump: 0.3 });
gen('dark_oak_sapling', (d, rng) => genSapling(d, rng, [70, 52, 34], [58, 110, 40], false), { smooth: 0.3, bump: 0.3 });
gen('acacia_sapling', (d, rng) => genSapling(d, rng, [104, 98, 88], [120, 150, 50], false), { smooth: 0.3, bump: 0.3 });

// ---- stones ----
gen('polished_granite', polishOf('granite', 0.55), { smooth: 0.55, bump: 1 });
gen('polished_diorite', polishOf('diorite', 0.6), { smooth: 0.55, bump: 1 });
gen('polished_andesite', polishOf('andesite', 0.5), { smooth: 0.5, bump: 1 });
gen('deepslate', (d, rng) => {
  const f = fbm(rng, 2, 3, 0.5, 8);
  fillTile(d, (x, y, k) => {
    let fa = 0.78 + f[k] * 0.36 + rng() * 0.05;
    if (((y + Math.round(f[k] * 6)) % 7) === 0) fa *= 0.78;   // layered cleavage
    put(d, x, y, [80, 80, 86], quant(fa, 12));
  });
}, { smooth: 0.2, bump: 1.8 });
gen('deepslate_top', (d, rng) => {
  noiseFill(d, rng, [84, 84, 90], 0.3, 4, 12);
  for (let r = 4; r < 16; r += 5) for (let a = 0; a < 64; a++) put(d, 16 + Math.round(Math.cos(a / 10) * r), 16 + Math.round(Math.sin(a / 10) * r), [64, 64, 70]);
}, { smooth: 0.2, bump: 1.5 });
gen('cobbled_deepslate', (d, rng) => {
  const v = voronoi(rng, 14);
  const br = Array.from({ length: 14 }, () => 0.8 + rng() * 0.3);
  stonesFromVoronoi(d, rng, v, (i) => shadec([82, 82, 88], br[i]), [34, 34, 38], 1.1, 0.4);
}, { smooth: 0.18, bump: 2.6 });
gen('deepslate_bricks', (d, rng) => brickWall(d, rng, [76, 76, 82], [40, 40, 44], 16, 8, 0.2), { smooth: 0.2, bump: 2.4 });
gen('deepslate_tiles', (d, rng) => tileGrid(d, rng, 4, () => [62, 62, 68], [30, 30, 34]), { smooth: 0.25, bump: 2.2 });
gen('calcite', (d, rng) => {
  noiseFill(d, rng, [226, 228, 222], 0.12, 4, 24);
  for (let i = 0; i < 40; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), [200, 204, 200]);
}, { smooth: 0.2, bump: 1 });
gen('tuff', (d, rng) => {
  noiseFill(d, rng, [110, 112, 100], 0.3, 5, 12);
  for (let i = 0; i < 70; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), rng() < 0.5 ? [140, 140, 124] : [84, 86, 76]);
}, { smooth: 0.15, bump: 1.8 });
gen('blackstone', (d, rng) => {
  genStone(d, rng, [46, 42, 50], [26, 24, 30]);
  for (let i = 0; i < 30; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), [84, 64, 60]);
}, { smooth: 0.25, bump: 1.8 });
gen('blackstone_top', (d, rng) => noiseFill(d, rng, [48, 44, 52], 0.3, 4, 12), { smooth: 0.25, bump: 1.5 });
gen('polished_blackstone', (d, rng) => {
  noiseFill(d, rng, [56, 52, 62], 0.08, 3, 24);
  bevelFrame(d, 0, 0, TM, TM, 1.2, 0.7); bevelFrame(d, 1, 1, TM - 1, TM - 1, 1.06, 0.88);
}, { smooth: 0.6, bump: 1.2 });
gen('blackstone_bricks', (d, rng) => brickWall(d, rng, [56, 52, 62], [24, 22, 28], 16, 8, 0.16), { smooth: 0.3, bump: 2.4 });
gen('chiseled_stone_bricks', (d, rng) => {
  noiseFill(d, rng, [138, 138, 140], 0.14, 4, 16);
  bevelFrame(d, 0, 0, TM, TM, 1.15, 0.6);
  for (const r of [4, 8]) bevelFrame(d, r, r, TM - r, TM - r, 0.7, 1.15);
  for (let y = 12; y <= 19; y++) for (let x = 12; x <= 19; x++) put(d, x, y, [110, 110, 114], (x + y) & 1 ? 0.9 : 1.05);
}, { smooth: 0.2, bump: 2.4 });
gen('cracked_stone_bricks', (d, rng, ctx) => {
  TEX_GEN.stone_bricks(d, rng, ctx);
  for (let c = 0; c < 4; c++) {
    let x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    for (let i = 0; i < 12; i++) { put(d, x, y, [56, 56, 58]); if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else y += 1; }
  }
}, { smooth: 0.2, bump: 2.6 });
gen('mossy_stone_bricks', (d, rng, ctx) => {
  TEX_GEN.stone_bricks(d, rng, ctx);
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => { if (f[k] > 0.56 || (y > 26 && f[k] > 0.42)) put(d, x, y, [82, 116, 52], 0.8 + f[k] * 0.4 + rng() * 0.1); });
}, { smooth: 0.18, bump: 2.4 });
gen('red_sandstone', (d, rng) => sandstoneSide(d, rng, [190, 102, 44], [170, 88, 36]), { smooth: 0.1, bump: 1.4 });
gen('red_sandstone_top', (d, rng) => noiseFill(d, rng, [192, 106, 48], 0.1, 4, 20), { smooth: 0.1, bump: 0.9 });
gen('cut_sandstone', (d, rng) => {
  noiseFill(d, rng, [218, 204, 152], 0.08, 3, 20);
  bevelFrame(d, 0, 0, TM, 15, 1.1, 0.78); bevelFrame(d, 0, 16, TM, TM, 1.1, 0.78);
}, { smooth: 0.12, bump: 1.6 });
gen('chiseled_sandstone', (d, rng) => {
  noiseFill(d, rng, [218, 204, 152], 0.08, 3, 20);
  bevelFrame(d, 0, 0, TM, TM, 1.12, 0.74);
  bevelFrame(d, 0, 0, TM, 5, 1.1, 0.8); bevelFrame(d, 0, 26, TM, TM, 1.1, 0.8);
  // an engraved sun between the bands
  for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; for (let r = 4; r < 9; r++) put(d, 16 + Math.round(Math.cos(an) * r), 16 + Math.round(Math.sin(an) * r * 0.9), [176, 160, 112]); }
  sprDisc(d, 16, 16, 3, [190, 172, 120]);
}, { smooth: 0.12, bump: 2 });
gen('mud_bricks', (d, rng) => brickWall(d, rng, [154, 116, 84], [196, 170, 132], 16, 8, 0.16), { smooth: 0.1, bump: 2 });
gen('packed_mud', (d, rng) => {
  noiseFill(d, rng, [150, 112, 80], 0.2, 4, 14);
  for (let i = 0; i < 22; i++) { const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS); for (let j = 0; j < 3; j++) put(d, x + j, y + (j >> 1), [206, 176, 104]); }
}, { smooth: 0.08, bump: 1.4 });
gen('quartz', (d, rng) => {
  noiseFill(d, rng, [236, 230, 222], 0.06, 3, 28);
  bevelFrame(d, 0, 0, TM, TM, 1.04, 0.9);
}, { smooth: 0.6, bump: 0.6 });
gen('quartz_pillar', (d, rng) => {
  noiseFill(d, rng, [234, 228, 220], 0.05, 3, 28);
  for (let y = 0; y < TS; y++) for (const x of [3, 10, 21, 28]) { put(d, x, y, [234, 228, 220], 0.86); put(d, x + 1, y, [234, 228, 220], 1.04); }
}, { smooth: 0.6, bump: 1 });
gen('quartz_pillar_top', (d, rng) => {
  noiseFill(d, rng, [234, 228, 220], 0.05, 3, 28);
  for (const r of [3, 8]) bevelFrame(d, r, r, TM - r, TM - r, 0.86, 1.05);
}, { smooth: 0.6, bump: 1 });
gen('quartz_bricks', (d, rng) => brickWall(d, rng, [236, 230, 222], [206, 200, 192], 16, 8, 0.05), { smooth: 0.55, bump: 1.4 });
gen('prismarine', (d, rng) => {
  const f = fbm(rng, 3, 3), g = fbm(rng, 6, 2);
  fillTile(d, (x, y, k) => put(d, x, y, mixc([88, 156, 140], [110, 176, 176], g[k]), quant(0.84 + f[k] * 0.3, 12)));
}, { smooth: 0.4, bump: 1.4 });
gen('prismarine_bricks', (d, rng) => brickWall(d, rng, [96, 170, 156], [60, 110, 100], 16, 8, 0.14), { smooth: 0.4, bump: 2 });
gen('dark_prismarine', (d, rng) => tileGrid(d, rng, 2, () => [44, 90, 76], [28, 56, 48], 2), { smooth: 0.45, bump: 1.8 });
gen('netherrack', (d, rng) => {
  const f = fbm(rng, 6, 3);
  fillTile(d, (x, y, k) => put(d, x, y, f[k] > 0.6 ? [132, 52, 50] : [108, 38, 38], quant(0.8 + f[k] * 0.3 + rng() * 0.12, 10)));
}, { smooth: 0.1, bump: 2 });
gen('nether_bricks', (d, rng) => brickWall(d, rng, [62, 30, 34], [30, 14, 18], 8, 8, 0.2), { smooth: 0.2, bump: 2.4 });
gen('end_stone', (d, rng) => {
  noiseFill(d, rng, [222, 222, 162], 0.16, 5, 16);
  for (let i = 0; i < 26; i++) { const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS); put(d, x, y, [178, 178, 124]); put(d, x + 1, y, [196, 196, 140]); }
}, { smooth: 0.15, bump: 1.6 });
gen('purpur', (d, rng) => tileGrid(d, rng, 2, () => [168, 122, 168], [128, 90, 128], 1), { smooth: 0.3, bump: 1.8 });

// ---- floors ----
gen('panot', (d, rng) => {
  // Barcelona's "flor" pavement: four grey cement tiles, each with a four-petal flower in relief
  noiseFill(d, rng, [158, 156, 150], 0.1, 4, 20);
  fillTile(d, (x, y) => {
    const tx = x & 15, ty = y & 15;
    if (tx === 0 || ty === 0) { put(d, x, y, [120, 118, 114]); return; }
    const u = tx - 8, v = ty - 8, r = Math.hypot(u, v), a = Math.atan2(v, u);
    const petal = r < 3.2 + 3 * Math.abs(Math.cos(2 * a));
    const ring = Math.abs(r - 1.6) < 0.7;
    if (petal && (r > 6 - 0.2 || Math.abs(r - (3.2 + 3 * Math.abs(Math.cos(2 * a)))) < 0.9)) put(d, x, y, [132, 130, 126]);
    else if (ring) put(d, x, y, [134, 132, 128]);
    else if (petal) put(d, x, y, [168, 166, 160], 1.02);
  });
}, { smooth: 0.15, bump: 2.2 });
gen('panot_side', (d, rng) => {
  noiseFill(d, rng, [150, 148, 142], 0.12, 4, 16);
  for (let x = 0; x < TS; x++) put(d, x, 0, [170, 168, 162]);
}, { smooth: 0.1, bump: 1.4 });
gen('hydraulic_tile', (d, rng) => {
  // encaustic cement tiles: each quarter holds a quarter-rosette so four tiles make one flower
  const cream = [226, 214, 190], red = [168, 64, 48], ink = [44, 52, 70], ochre = [206, 158, 72];
  fillTile(d, (x, y) => {
    const tx = x & 15, ty = y & 15;
    if (tx === 0 || ty === 0) { put(d, x, y, [178, 168, 150]); return; }
    // distance to the shared corner at the middle of the block and to the tile's own corner
    const u = Math.abs(x + 0.5 - 16), v = Math.abs(y + 0.5 - 16), r = Math.hypot(u, v), a = Math.atan2(v, u);
    const cu = Math.min(tx, 16 - tx), cv = Math.min(ty, 16 - ty);
    let c = cream;
    if (r < 4) c = ochre;
    else if (r < 11 && r < 7 + 3.5 * Math.abs(Math.cos(2 * a))) c = red;
    else if (Math.abs(r - 12.5) < 1) c = ink;
    else if (cu + cv < 5 && (cu < 2 || cv < 2)) c = ink;
    put(d, x, y, c, quant(0.95 + rng() * 0.06, 20));
  });
}, { smooth: 0.35, bump: 0.8 });
gen('tile_side', (d, rng) => {
  noiseFill(d, rng, [170, 164, 150], 0.1, 4, 16);
  for (let x = 0; x < TS; x++) { put(d, x, 0, [206, 196, 176]); put(d, x, 1, [196, 186, 166]); }
}, { smooth: 0.15, bump: 1 });
gen('checker_tile', (d, rng) => tileGrid(d, rng, 4, (i, j) => (i + j) & 1 ? [34, 34, 38] : [232, 230, 224], [120, 120, 118]), { smooth: 0.7, bump: 0.8 });
gen('parquet', (d, rng) => {
  // herringbone: 16x4 boards turning every row
  const f = fbm(rng, 2, 2, 0.5, 8);
  const tone = Array.from({ length: 64 }, () => 0.86 + rng() * 0.2);
  fillTile(d, (x, y, k) => {
    const a = (x + y) & TM, b = (x - y + 64) & TM;
    const up = ((x >> 2) + (y >> 2)) & 1;
    const s = up ? a : b, along = up ? b : a;
    const board = (s >> 2) * 8 + (along >> 3);
    let fa = tone[board & 63] * (0.9 + f[k] * 0.16);
    if ((s & 3) === 3 || (along & 7) === 7) fa *= 0.72;
    put(d, x, y, [170, 122, 70], quant(fa, 14));
  });
}, { smooth: 0.45, bump: 1.2 });
gen('terrazzo', (d, rng) => {
  noiseFill(d, rng, [218, 214, 206], 0.06, 3, 24);
  const chips = [[160, 60, 50], [70, 70, 74], [206, 168, 90], [120, 140, 150], [240, 240, 236], [110, 150, 110]];
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS), c = chips[Math.floor(rng() * chips.length)];
    put(d, x, y, c); if (rng() < 0.5) put(d, x + 1, y, c); if (rng() < 0.3) put(d, x, y + 1, c);
  }
}, { smooth: 0.75, bump: 0.5 });
gen('blue_tiles', (d, rng) => {
  const tone = Array.from({ length: 16 }, () => 0.86 + rng() * 0.22);
  tileGrid(d, rng, 4, (i, j) => shadec([40, 96, 178], tone[j * 4 + i]), [230, 230, 224]);
  // a few patterned tiles, like Portuguese / Catalan azulejos
  for (const [i, j] of [[1, 1], [3, 2], [0, 3]]) {
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) if (Math.abs(x - 4) + Math.abs(y - 4) === 2) put(d, i * 8 + x, j * 8 + y, [236, 236, 240]);
  }
}, { smooth: 0.8, bump: 0.8 });
CONCRETE_COLORS.forEach(([, col], i) => {
  gen('concrete_' + i, (d, rng) => {
    const f = fbm(rng, 4, 2);
    fillTile(d, (x, y, k) => put(d, x, y, col, quant(0.95 + f[k] * 0.06 + rng() * 0.02, 32)));
  }, { smooth: 0.3, bump: 0.4 });
});

// ---- metals ----
for (let s = 0; s < 4; s++) {
  gen('copper_' + s, (d, rng) => {
    // copper turning to verdigris in patches as it weathers
    const f = fbm(rng, 4, 3), g = fbm(rng, 8, 2);
    const t = s / 3;
    fillTile(d, (x, y, k) => {
      const green = smoothstep(0.75 - t * 0.7, 0.85 - t * 0.6, f[k]) * Math.min(1, t * 1.6);
      const c = mixc(mixc([198, 112, 76], [168, 128, 96], Math.min(1, t * 1.5)), [82, 168, 140], green);
      put(d, x, y, c, quant(0.9 + g[k] * 0.16, 16));
    });
    bevelFrame(d, 0, 0, TM, TM, 1.14, 0.74);
  }, { smooth: 0.65 - s * 0.14, bump: 1.2 });
}
gen('cut_copper', (d, rng) => {
  tileGrid(d, rng, 2, () => [196, 112, 78], [140, 72, 50]);
  for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28], [19, 3], [12, 28]]) put(d, x, y, [236, 170, 130]);
}, { smooth: 0.6, bump: 1.6 });
gen('amethyst', (d, rng) => {
  const v = voronoi(rng, 11);
  const tone = Array.from({ length: 11 }, () => 0.8 + rng() * 0.35);
  fillTile(d, (x, y, k) => {
    const e = v.edge[k];
    const c = e < 0.9 ? [92, 60, 150] : mixc([150, 100, 210], [204, 164, 240], clamp(-(v.ox[k] + v.oy[k]) / 12 + 0.5, 0, 1));
    put(d, x, y, c, quant(tone[v.id[k]], 12));
  });
}, { smooth: 0.8, bump: 1.8 });
gen('steel_plate', (d, rng) => {
  noiseFill(d, rng, [150, 154, 160], 0.1, 3, 20);
  // raised diamond tread
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = i * 8 + (j & 1) * 4 + 2, cy = j * 8 + 3, dir = (i + j) & 1;
    for (let s = -2; s <= 2; s++) { put(d, cx + s, cy + (dir ? s : -s) * 0.5, [196, 200, 206]); put(d, cx + s, cy + 1 + (dir ? s : -s) * 0.5, [96, 100, 106]); }
  }
  bevelFrame(d, 0, 0, TM, TM, 1.15, 0.7);
}, { smooth: 0.7, bump: 2 });

// ---- light ----
gen('sea_lantern', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const tx = x & 15, ty = y & 15, edge = Math.min(tx, ty, 15 - tx, 15 - ty);
    const c = edge === 0 ? [150, 190, 186] : edge < 3 ? [196, 226, 220] : [226, 246, 240];
    put(d, x, y, c, 0.94 + rng() * 0.08);
    ctx.emit[k] = edge === 0 ? 0.4 : 0.9 + rng() * 0.1;
  });
}, { smooth: 0.8, bump: 1 });
gen('shroomlight', (d, rng, ctx) => {
  const f = fbm(rng, 5, 3);
  fillTile(d, (x, y, k) => {
    const hot = f[k] > 0.55;
    put(d, x, y, hot ? [255, 214, 120] : [232, 140, 64], quant(0.86 + f[k] * 0.24 + rng() * 0.06, 12));
    ctx.emit[k] = hot ? 1 : 0.55;
  });
}, { smooth: 0.3, bump: 1.4 });
gen('glass_lamp', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const frame = x < 2 || y < 2 || x > TM - 2 || y > TM - 2 || x === 15 || x === 16 || y === 15 || y === 16;
    if (frame) { put(d, x, y, [60, 62, 68], 0.9 + rng() * 0.2); ctx.emit[k] = 0; return; }
    const g = 1 - Math.hypot((x & 15) - 7.5, (y & 15) - 7.5) / 12;
    put(d, x, y, [255, 214, 140], 0.84 + g * 0.3);
    ctx.emit[k] = 0.7 + g * 0.3;
  });
}, { smooth: 0.8, bump: 1 });
gen('paper_lantern', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const rib = y % 6 === 0;
    const band = y < 3 || y > 28;
    const c = band ? [40, 30, 28] : rib ? [150, 36, 30] : [228, 70, 52];
    put(d, x, y, c, 0.92 + rng() * 0.1 + (band ? 0 : 0.1 * Math.sin((x / TS) * Math.PI)));
    ctx.emit[k] = band ? 0 : rib ? 0.5 : 0.85;
  });
}, { smooth: 0.2, bump: 0.8 });
gen('paper_lantern_top', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [40, 30, 28], 0.9 + rng() * 0.15));
  sprDisc(d, 16, 16, 4, [150, 120, 60]);
}, { smooth: 0.3, bump: 0.8 });
gen('amethyst_cluster', (d, rng, ctx) => {
  clearTile(d, [150, 100, 210]);
  for (const [x0, h, lean] of [[16, 26, 0], [9, 16, -0.25], [23, 18, 0.28], [13, 11, -0.1], [20, 12, 0.12]]) {
    for (let i = 0; i < h; i++) {
      const w = Math.max(0, Math.round(2.4 * (1 - i / h)));
      const cx = Math.round(x0 + lean * i);
      for (let x = -w; x <= w; x++) {
        put(d, cx + x, TM - i, x < 0 ? [206, 168, 244] : [140, 92, 200], 0.9 + rng() * 0.1);
        ctx.emit[(TM - i) * TS + ((cx + x) & TM)] = 0.6;
      }
    }
  }
}, { smooth: 0.8, bump: 0.5 });

// ---- nature ----
gen('moss', (d, rng) => {
  const f = fbm(rng, 6, 3);
  fillTile(d, (x, y, k) => put(d, x, y, f[k] > 0.62 ? [110, 150, 56] : [82, 122, 44], quant(0.82 + f[k] * 0.3 + rng() * 0.08, 12)));
}, { smooth: 0.05, bump: 1.8 });
gen('mud', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [70, 58, 54], quant(0.82 + f[k] * 0.3, 14)));
}, { smooth: 0.6, bump: 1 });
gen('podzol_top', (d, rng) => {
  noiseFill(d, rng, [110, 76, 40], 0.24, 4, 12);
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS), a = rng() * Math.PI;
    for (let j = 0; j < 3; j++) put(d, x + Math.round(Math.cos(a) * j), y + Math.round(Math.sin(a) * j), rng() < 0.5 ? [140, 100, 50] : [80, 54, 28]);
  }
}, { smooth: 0.05, bump: 1.6 });
gen('podzol_side', (d, rng) => {
  genDirt(d, rng);
  grassOverhang(d, rng, [[124, 88, 46], [100, 70, 38], [72, 50, 28]], 3, 6);
}, { smooth: 0.05, bump: 1.4 });
gen('coarse_dirt', (d, rng) => {
  genDirt(d, rng);
  for (let i = 0; i < 60; i++) { const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS); put(d, x, y, [128, 124, 118]); if (rng() < 0.5) put(d, x + 1, y, [96, 92, 88]); }
}, { smooth: 0.04, bump: 1.8 });
gen('sunflower', (d, rng) => {
  clearTile(d, [70, 120, 50]);
  stem(d, [[15, 31], [15, 13]], [66, 128, 44], 2);
  for (const [lx, ly, dir] of [[14, 26, -1], [17, 22, 1]]) for (let i = 0; i < 6; i++) { put(d, lx + dir * i, ly - Math.floor(i * 0.5), [74, 150, 50]); put(d, lx + dir * i, ly - Math.floor(i * 0.5) + 1, [56, 118, 38]); }
  fillTile(d, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, (y + 0.5 - 8) * 1.1);
    if (r < 3.4) put(d, x, y, [92, 60, 30], 0.8 + rng() * 0.3);
    else if (r < 7.6 - (Math.floor(Math.atan2(y - 8, x - 16) * 4) & 1) * 1.2) put(d, x, y, [250, 206, 40], 0.9 + rng() * 0.14);
  });
}, { smooth: 0.3, bump: 0.3 });
gen('lavender', (d, rng) => {
  clearTile(d, [120, 100, 180]);
  for (let s = 0; s < 6; s++) {
    const x0 = 5 + s * 4 + Math.floor(rng() * 3), h = 16 + Math.floor(rng() * 12), lean = (rng() - 0.5) * 0.3;
    for (let i = 0; i < h; i++) {
      const x = Math.round(x0 + lean * i), y = TM - i;
      if (i < h - 9) put(d, x, y, [106, 140, 100]);
      else { put(d, x, y, [150, 112, 210], 0.85 + rng() * 0.3); if (i % 2) { put(d, x - 1, y, [128, 92, 190]); put(d, x + 1, y, [170, 136, 226]); } }
    }
  }
}, { smooth: 0.3, bump: 0.3 });
gen('lily_of_valley', (d, rng) => {
  clearTile(d, [70, 130, 60]);
  for (const [x0, lean] of [[11, -0.2], [20, 0.25]]) for (let i = 0; i < 22; i++) { put(d, Math.round(x0 + lean * i), TM - i, [66, 140, 56]); put(d, Math.round(x0 + lean * i) + 1, TM - i, [86, 164, 70]); }
  stem(d, [[16, 31], [16, 10], [20, 7], [24, 9]], [80, 140, 60], 1);
  for (const [bx, by] of [[18, 9], [22, 11], [25, 14], [15, 12]]) { sprDisc(d, bx, by + 1, 1.6, [250, 250, 244]); put(d, bx, by + 3, [226, 226, 216]); }
}, { smooth: 0.3, bump: 0.3 });
gen('cornflower', (d, rng) => {
  flowerBase(d, rng, 13);
  for (let a = 0; a < 10; a++) {
    const an = a / 10 * Math.PI * 2;
    for (let r = 1; r < 6; r++) put(d, 16 + Math.round(Math.cos(an) * r), 10 + Math.round(Math.sin(an) * r * 0.85), r > 3 ? [60, 110, 232] : [44, 80, 200]);
  }
  sprDisc(d, 16, 10, 1.4, [40, 40, 120]);
}, { smooth: 0.3, bump: 0.3 });
gen('allium', (d, rng) => {
  clearTile(d, [160, 100, 200]);
  stem(d, [[16, 31], [16, 12]], [70, 136, 60], 1);
  for (let i = 0; i < 4; i++) put(d, 15 - i, 28 - i, [80, 150, 60]);
  fillTile(d, (x, y) => { if (Math.hypot(x + 0.5 - 16, y + 0.5 - 8) < 5.5 && rng() < 0.85) put(d, x, y, rng() < 0.3 ? [214, 150, 240] : [168, 96, 210], 0.9 + rng() * 0.15); });
}, { smooth: 0.3, bump: 0.3 });
gen('daisy', (d, rng) => {
  clearTile(d, [230, 230, 220]);
  for (const [cx, cy, s] of [[10, 14, 1], [21, 10, 1.2], [17, 20, 0.9]]) {
    stem(d, [[cx, 31], [cx, cy]], [80, 146, 56], 1);
    for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2; for (let r = 1; r < 3.6 * s; r++) put(d, cx + Math.round(Math.cos(an) * r), cy + Math.round(Math.sin(an) * r), [250, 250, 246]); }
    put(d, cx, cy, [244, 196, 40]); put(d, cx + 1, cy, [244, 196, 40]);
  }
}, { smooth: 0.3, bump: 0.3 });
gen('pink_tulip', (d, rng) => {
  flowerBase(d, rng, 15);
  const cup = (x, y) => y >= 6 && y <= 15 && Math.abs(x + 0.5 - 16) <= 4.6 - Math.max(0, 12 - y) * 0.15 - Math.max(0, y - 12) * 0.9;
  fillTile(d, (x, y) => {
    if (!cup(x, y) || (y < 9 && (x === 15 || x === 16 || x === 12 || x === 19))) return;
    put(d, x, y, [244, 150, 190], quant((x < 16 ? 1.06 : 0.9) * (0.9 + rng() * 0.1), 10));
  });
}, { smooth: 0.3, bump: 0.3 });
gen('bush', (d, rng) => {
  clearTile(d, [84, 150, 58]);
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI, r = rng();
    const cx = 16 + Math.cos(a) * r * 13, cy = 30 - Math.sin(a) * r * 18;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y < 4.5) put(d, Math.round(cx) + x, Math.round(cy) + y, [84, 150, 58], quant(0.72 + rng() * 0.45 - y * 0.03, 10));
  }
}, { smooth: 0.3, bump: 1 });
gen('bamboo', (d, rng) => {
  clearTile(d, [110, 160, 60]);
  for (const x0 of [9, 18]) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < 4; x++) {
      const node = y % 11 === 0;
      put(d, x0 + x, y, node ? [100, 130, 44] : [130, 176, 66], (x === 0 ? 0.8 : x === 3 ? 0.9 : 1.08) * (node ? 0.85 : 1));
    }
  }
  for (const [x, y, dir] of [[13, 10, 1], [17, 21, -1], [22, 4, 1]]) for (let i = 0; i < 6; i++) { put(d, x + dir * i, y - (i >> 1), [96, 156, 56]); put(d, x + dir * i, y - (i >> 1) + 1, [76, 128, 44]); }
}, { smooth: 0.35, bump: 0.5 });
gen('hydrangea', (d, rng) => {
  clearTile(d, [70, 120, 60]);
  for (let i = 0; i < 40; i++) {
    const x = 4 + Math.floor(rng() * 24), y = 14 + Math.floor(rng() * 17);
    put(d, x, y, [64, 124, 50], 0.8 + rng() * 0.4); put(d, x + 1, y, [64, 124, 50], 0.7 + rng() * 0.3);
  }
  for (const [cx, cy, c] of [[10, 12, [110, 140, 230]], [21, 10, [180, 130, 220]], [16, 18, [236, 150, 200]]]) {
    fillTile(d, (x, y) => { if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 4.8 && rng() < 0.9) put(d, x, y, c, 0.8 + rng() * 0.35); });
  }
}, { smooth: 0.3, bump: 0.5 });

// ---- furniture ----
gen('crate', (d, rng, ctx) => {
  TEX_GEN.planks(d, rng, ctx);
  const wood = [140, 104, 60];
  fillTile(d, (x, y) => {
    const frame = x < 3 || y < 3 || x > TM - 3 || y > TM - 3;
    const brace = Math.abs(x - y) < 2;
    if (frame) put(d, x, y, wood, (x < 1 || y < 1) ? 1.1 : (x > TM - 1 || y > TM - 1) ? 0.7 : 0.92 + rng() * 0.08);
    else if (brace) put(d, x, y, wood, x > y ? 0.8 : 1.02);
  });
  for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30]]) put(d, x, y, [70, 70, 74]);
}, { smooth: 0.2, bump: 1.8 });
gen('sponge', (d, rng) => {
  noiseFill(d, rng, [212, 200, 70], 0.16, 4, 14);
  for (let i = 0; i < 40; i++) { const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS); put(d, x, y, [140, 124, 36]); if (rng() < 0.5) put(d, x + 1, y, [160, 146, 44]); }
}, { smooth: 0.05, bump: 2 });
gen('honeycomb', (d, rng) => {
  fillTile(d, (x, y) => {
    // hexagonal cells, 8 px across, offset every other row
    const row = Math.floor(y / 7), yy = y - row * 7, xx = (x + (row & 1) * 4) & 7;
    const wall = yy === 0 || xx === 0;
    put(d, x, y, wall ? [196, 126, 30] : [240, 172, 48], wall ? 0.9 : 0.95 + (yy > 4 ? -0.08 : 0.06) + rng() * 0.05);
  });
}, { smooth: 0.55, bump: 1.8 });
gen('chalkboard', (d, rng) => {
  const f = fbm(rng, 4, 2);
  fillTile(d, (x, y, k) => {
    if (x < 2 || x > TM - 2 || y < 2 || y > TM - 2) { put(d, x, y, [110, 76, 44], x < 1 || y < 1 ? 1.1 : 0.9); return; }
    put(d, x, y, [40, 72, 56], 0.9 + f[k] * 0.16 + (rng() < 0.05 ? 0.2 : 0));
  });
  // a sum and a few lines of "writing" in chalk
  for (const [y, len] of [[6, 18], [10, 22], [14, 12], [20, 16], [24, 20]]) {
    let x = 4;
    while (x < 4 + len) { const w = 2 + Math.floor(rng() * 3); for (let i = 0; i < w; i++) if (rng() < 0.8) put(d, x + i, y + (rng() < 0.3 ? 1 : 0), [226, 232, 226]); x += w + 1; }
  }
  for (let x = 3; x < TM - 2; x++) put(d, x, TM - 2, [150, 110, 64]);   // chalk tray
}, { smooth: 0.1, bump: 0.6 });
gen('whiteboard', (d, rng) => {
  fillTile(d, (x, y) => {
    if (x < 2 || x > TM - 2 || y < 2 || y > TM - 2) { put(d, x, y, [186, 190, 196], 0.9 + rng() * 0.15); return; }
    put(d, x, y, [244, 246, 248], 0.97 + rng() * 0.03);
  });
  const ink = [[40, 70, 170], [190, 40, 40], [30, 30, 34]];
  for (const [y, len, c] of [[6, 20, 0], [10, 14, 0], [15, 22, 2], [21, 10, 1], [25, 18, 2]]) {
    let x = 5;
    while (x < 5 + len) { const w = 2 + Math.floor(rng() * 3); for (let i = 0; i < w; i++) put(d, x + i, y + (rng() < 0.3 ? 1 : 0), ink[c]); x += w + 1; }
  }
  for (let x = 3; x < TM - 2; x++) put(d, x, TM - 2, [140, 144, 150]);
}, { smooth: 0.9, bump: 0.3 });
gen('corkboard', (d, rng) => {
  fillTile(d, (x, y) => {
    if (x < 2 || x > TM - 2 || y < 2 || y > TM - 2) { put(d, x, y, [150, 112, 66], 0.9 + rng() * 0.15); return; }
    put(d, x, y, rng() < 0.2 ? [150, 102, 58] : [190, 142, 90], 0.92 + rng() * 0.12);
  });
  const notes = [[5, 5, 9, 8, [250, 240, 140]], [16, 4, 10, 11, [250, 250, 250]], [6, 17, 11, 9, [170, 220, 250]], [20, 19, 8, 8, [250, 180, 200]]];
  for (const [x0, y0, w, h, c] of notes) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(d, x, y, c, y === y0 + h - 1 ? 0.85 : 1);
    for (let y = y0 + 3; y < y0 + h - 1; y += 2) for (let x = x0 + 1; x < x0 + w - 1; x++) if (rng() < 0.7) put(d, x, y, [120, 120, 130]);
    put(d, x0 + (w >> 1), y0 + 1, [220, 40, 40]);
  }
}, { smooth: 0.1, bump: 1.4 });

// ---- recipes ----
TAG.planks = PLANKS_ALL;
TAG.logs = LOGS;
TAG.leaves.push(B.DARK_OAK_LEAVES, B.CHERRY_LEAVES, B.ACACIA_LEAVES);
[[B.DARK_OAK_LOG, B.DARK_OAK_PLANKS], [B.CHERRY_LOG, B.CHERRY_PLANKS], [B.ACACIA_LOG, B.ACACIA_PLANKS]].forEach(([l, p]) => shapeless(p, 4, [l]));
shaped(B.BAMBOO_PLANKS, 2, ['BB', 'BB'], { B: B.BAMBOO });
const four = (out, n, from) => shaped(out, n, ['XX', 'XX'], { X: from });
four(B.POLISHED_GRANITE, 4, B.GRANITE);
four(B.POLISHED_DIORITE, 4, B.DIORITE);
four(B.POLISHED_ANDESITE, 4, B.ANDESITE);
four(B.DEEPSLATE_BRICKS, 4, B.COBBLED_DEEPSLATE);
four(B.DEEPSLATE_TILES, 4, B.DEEPSLATE_BRICKS);
four(B.POLISHED_BLACKSTONE, 4, B.BLACKSTONE);
four(B.BLACKSTONE_BRICKS, 4, B.POLISHED_BLACKSTONE);
four(B.RED_SANDSTONE, 1, B.RED_SAND);
four(B.CUT_SANDSTONE, 4, B.SANDSTONE);
four(B.MUD_BRICKS, 4, B.PACKED_MUD);
four(B.QUARTZ_BRICKS, 4, B.QUARTZ_BLOCK);
four(B.PRISMARINE_BRICKS, 4, B.PRISMARINE);
four(B.CUT_COPPER, 4, B.COPPER_BLOCK);
four(B.PURPUR, 4, B.END_STONE);
shaped(B.CHISELED_STONE_BRICKS, 1, ['S', 'S'], { S: B.STONE_BRICK_SLAB });
shaped(B.CHISELED_SANDSTONE, 1, ['S', 'S'], { S: B.SANDSTONE_SLAB });
shaped(B.QUARTZ_PILLAR, 2, ['Q', 'Q'], { Q: B.QUARTZ_BLOCK });
shapeless(B.MOSSY_STONE_BRICKS, 1, [B.STONE_BRICKS, B.MOSS_BLOCK]);
shapeless(B.PACKED_MUD, 1, [B.MUD, I.WHEAT]);
shapeless(B.MUD, 1, [B.DIRT, B.CLAY]);
shapeless(B.COARSE_DIRT, 4, [B.DIRT, B.GRAVEL, B.DIRT, B.GRAVEL]);
shaped(B.QUARTZ_BLOCK, 4, ['DS', 'SD'], { D: B.DIORITE, S: [B.SAND, B.WHITE_SAND] });
shaped(B.PRISMARINE, 4, ['CC', 'CC'], { C: [B.CORAL, B.CORAL + 1, B.CORAL + 2] });
shaped(B.DARK_PRISMARINE, 8, ['PPP', 'PIP', 'PPP'], { P: B.PRISMARINE, I: TAG.coal });
shaped(B.NETHER_BRICKS, 4, ['BB', 'BB'], { B: B.NETHERRACK });
shaped(B.PANOT, 8, ['SSS', 'SCS', 'SSS'], { S: B.SMOOTH_STONE, C: B.GRAVEL });
shaped(B.HYDRAULIC_TILE, 8, ['TWT', 'WRW', 'TWT'], { T: B.SMOOTH_STONE, W: B.WOOL, R: B.WOOL + 14 });
shaped(B.CHECKER_TILE, 8, ['WK', 'KW'], { W: B.CONCRETE, K: B.CONCRETE + 15 });
shaped(B.PARQUET, 4, ['PS', 'SP'], { P: B.DARK_OAK_PLANKS, S: B.PLANKS });
shaped(B.TERRAZZO, 8, ['CCC', 'CGC', 'CCC'], { C: B.CONCRETE, G: B.GRAVEL });
shaped(B.BLUE_TILES, 8, ['TTT', 'TBT', 'TTT'], { T: B.TERRACOTTA_C + 2, B: B.WOOL + 11 });
WOOL_COLORS.forEach((_, i) => shaped(B.CONCRETE + i, 8, ['SSS', 'SWS', 'GGG'], { S: B.SAND, W: B.WOOL + i, G: B.GRAVEL }));
shaped(B.COPPER_BLOCK, 1, ['III', 'IGI', 'III'], { I: I.IRON_INGOT, G: I.GOLD_INGOT });
shaped(B.STEEL_PLATE, 4, ['II', 'II'], { I: B.IRON_BARS });
shaped(B.SEA_LANTERN, 1, ['PGP', 'GGG', 'PGP'], { P: B.PRISMARINE, G: B.GLOWSTONE });
shaped(B.SHROOMLIGHT, 1, ['MMM', 'MGM', 'MMM'], { M: [B.RED_MUSHROOM, B.BROWN_MUSHROOM], G: B.GLOWSTONE });
shaped(B.GLASS_LAMP, 1, [' I ', 'GTG', ' I '], { I: I.IRON_INGOT, G: B.GLASS, T: B.GLOWSTONE });
shaped(B.PAPER_LANTERN, 2, ['PPP', 'PTP', 'PPP'], { P: I.PAPER, T: B.TORCH });
shaped(B.AMETHYST_BLOCK, 1, ['AA', 'AA'], { A: B.AMETHYST_CLUSTER });
shaped(B.CRATE, 2, ['PSP', 'SPS', 'PSP'], { P: TAG.planks, S: I.STICK });
shaped(B.HONEYCOMB, 1, ['WW', 'WW'], { W: B.WOOL + 4 });
shaped(B.CHALKBOARD, 1, ['PPP', 'PCP', 'PPP'], { P: B.DARK_OAK_PLANKS, C: B.WOOL + 13 });
shaped(B.WHITEBOARD, 1, ['III', 'IWI', 'III'], { I: I.IRON_INGOT, W: B.CONCRETE });
shaped(B.CORKBOARD, 1, ['SSS', 'SPS', 'SSS'], { S: I.STICK, P: I.PAPER });
[[B.DARK_OAK_SLAB, B.DARK_OAK_PLANKS], [B.CHERRY_SLAB, B.CHERRY_PLANKS], [B.ACACIA_SLAB, B.ACACIA_PLANKS], [B.BAMBOO_SLAB, B.BAMBOO_PLANKS],
  [B.QUARTZ_SLAB, B.QUARTZ_BLOCK], [B.DEEPSLATE_BRICK_SLAB, B.DEEPSLATE_BRICKS], [B.BLACKSTONE_SLAB, B.POLISHED_BLACKSTONE],
  [B.MUD_BRICK_SLAB, B.MUD_BRICKS], [B.RED_SANDSTONE_SLAB, B.RED_SANDSTONE], [B.PRISMARINE_SLAB, B.PRISMARINE_BRICKS],
  [B.POLISHED_ANDESITE_SLAB, B.POLISHED_ANDESITE], [B.POLISHED_GRANITE_SLAB, B.POLISHED_GRANITE], [B.POLISHED_DIORITE_SLAB, B.POLISHED_DIORITE],
  [B.CUT_COPPER_SLAB, B.CUT_COPPER], [B.TERRAZZO_SLAB, B.TERRAZZO], [B.CONCRETE_SLAB, B.CONCRETE]].forEach(([s, f]) => shaped(s, 6, ['XXX'], { X: f }));
[[B.DARK_OAK_FENCE, B.DARK_OAK_PLANKS], [B.CHERRY_FENCE, B.CHERRY_PLANKS], [B.ACACIA_FENCE, B.ACACIA_PLANKS], [B.BAMBOO_FENCE, B.BAMBOO_PLANKS]]
  .forEach(([fe, p]) => shaped(fe, 3, ['PSP', 'PSP'], { P: p, S: I.STICK }));
[[B.BRICK_WALL, B.BRICKS], [B.SANDSTONE_WALL, B.SANDSTONE], [B.DEEPSLATE_WALL, B.DEEPSLATE_BRICKS], [B.BLACKSTONE_WALL, B.POLISHED_BLACKSTONE],
  [B.MUD_BRICK_WALL, B.MUD_BRICKS], [B.RED_SANDSTONE_WALL, B.RED_SANDSTONE], [B.MOSSY_STONE_WALL, B.MOSSY_STONE_BRICKS]]
  .forEach(([w, s]) => shaped(w, 6, ['CCC', 'CCC'], { C: s }));

// smelting
SMELT[B.COBBLED_DEEPSLATE] = B.DEEPSLATE;
SMELT[B.STONE_BRICKS] = B.CRACKED_STONE_BRICKS;
SMELT[B.WHITE_SAND] = B.GLASS;
SMELT[B.RED_SAND] = B.GLASS;
SMELT[B.NETHERRACK] = B.NETHER_BRICKS;
SMELT[B.EXPOSED_COPPER] = B.COPPER_BLOCK;
SMELT[B.WEATHERED_COPPER] = B.EXPOSED_COPPER;
SMELT[B.OXIDIZED_COPPER] = B.WEATHERED_COPPER;

// fuel
for (const id of [B.DARK_OAK_LOG, B.CHERRY_LOG, B.ACACIA_LOG]) ITEM_DEF[id].fuel = ITEM_DEF[B.LOG].fuel;
for (const id of [B.DARK_OAK_PLANKS, B.CHERRY_PLANKS, B.ACACIA_PLANKS, B.BAMBOO_PLANKS, B.CRATE]) ITEM_DEF[id].fuel = ITEM_DEF[B.PLANKS].fuel;
for (const id of [B.DARK_OAK_FENCE, B.CHERRY_FENCE, B.ACACIA_FENCE, B.BAMBOO_FENCE]) ITEM_DEF[id].fuel = 15;
for (let id = B.SHAPE1; id < B.SHAPE1_END; id++) if (ARCH_MATS[BLOCK_SHAPE_MAT[id]].o === WOOD) ITEM_DEF[id].fuel = 10;
ITEM_DEF[B.BAMBOO].fuel = 3;

// drops: new leaves drop saplings, deepslate gives its cobbles, amethyst clusters shatter
{
  const base = blockDrops;
  const SAP = { [B.DARK_OAK_LEAVES]: B.DARK_OAK_SAPLING, [B.CHERRY_LEAVES]: B.CHERRY_SAPLING, [B.ACACIA_LEAVES]: B.ACACIA_SAPLING };
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (SAP[id]) {
      if (!canHarvest(id, toolItem)) return [];
      const d = ITEM_DEF[toolItem];
      if (d && d.tool === TOOL_SHEARS) return [[id, 1]];
      const out = [];
      if (rnd() < 0.07) out.push([SAP[id], 1]);
      if (rnd() < 0.03) out.push([I.STICK, 1]);
      return out;
    }
    if (id === B.DEEPSLATE) return canHarvest(id, toolItem) ? [[B.COBBLED_DEEPSLATE, 1]] : [];
    if (id === B.BUSH) { const d = ITEM_DEF[toolItem]; return d && d.tool === TOOL_SHEARS ? [[id, 1]] : rnd() < 0.2 ? [[I.STICK, 1]] : []; }
    return base(id, toolItem, rnd);
  };
}

// ---- rails: ballast, sleepers and two steel rails (texture x = east, y = south) ----
const RAIL_STEEL = [150, 154, 160], RAIL_SHINE = [212, 216, 222], RAIL_WOOD = [104, 74, 46];
function railBed(d, rng, ctx) {
  TEX_GEN.gravel(d, rng, ctx);
  fillTile(d, (x, y, k) => { const i = k << 2; d[i] *= 0.72; d[i + 1] *= 0.7; d[i + 2] *= 0.68; });
}
// straight: along y (north-south) or along x when `ew`
function railStraight(ew) {
  return (d, rng, ctx) => {
    railBed(d, rng, ctx);
    fillTile(d, (x, y) => {
      const a = ew ? y : x, b = ew ? x : y;       // a across the track, b along it
      const sl = b % 8;
      if (sl >= 1 && sl <= 4 && a >= 2 && a <= 29) put(d, x, y, RAIL_WOOD, (sl === 1 ? 1.12 : sl === 4 ? 0.78 : 0.95) * (0.92 + rng() * 0.1));
      const r = Math.min(Math.abs(a - 8), Math.abs(a - 23));
      if (a >= 7 && a <= 9 || a >= 22 && a <= 24) put(d, x, y, r === 0 || a === 7 || a === 22 ? RAIL_SHINE : RAIL_STEEL, a === 9 || a === 24 ? 0.7 : 1);
    });
  };
}
// curve around the corner (cx, cy) of the tile
function railCurve(cx, cy) {
  return (d, rng, ctx) => {
    railBed(d, rng, ctx);
    fillTile(d, (x, y) => {
      const px = x + 0.5 - cx, py = y + 0.5 - cy, r = Math.hypot(px, py);
      const ang = Math.atan2(Math.abs(py), Math.abs(px));        // 0..pi/2 across the quarter
      const ph = (ang / (Math.PI / 2)) * 5 % 1;
      if (r > 4 && r < 28 && ph > 0.15 && ph < 0.6) put(d, x, y, RAIL_WOOD, (ph < 0.25 ? 1.1 : ph > 0.5 ? 0.8 : 0.95) * (0.92 + rng() * 0.1));
      for (const R of [8.5, 23.5]) {
        const e = r - R;
        if (Math.abs(e) <= 1.5) put(d, x, y, Math.abs(e) < 0.6 ? RAIL_SHINE : RAIL_STEEL, e > 0.8 ? 0.7 : 1);
      }
    });
  };
}
gen('rail_ns', railStraight(false), { smooth: 0.3, bump: 1.6 });
gen('rail_ew', railStraight(true), { smooth: 0.3, bump: 1.6 });
gen('rail_ne', railCurve(TS, 0), { smooth: 0.3, bump: 1.6 });
gen('rail_es', railCurve(TS, TS), { smooth: 0.3, bump: 1.6 });
gen('rail_sw', railCurve(0, TS), { smooth: 0.3, bump: 1.6 });
gen('rail_wn', railCurve(0, 0), { smooth: 0.3, bump: 1.6 });
gen('rail_side', (d, rng, ctx) => { railBed(d, rng, ctx); }, { smooth: 0.1, bump: 1.4 });

// ---- campus: computer, lockers, vending machine ----
gen('computer_front', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    // dark bezel, glowing screen with a code editor, a stand and a keyboard below
    const bez = x >= 2 && x <= 29 && y >= 3 && y <= 21;
    const scr = x >= 4 && x <= 27 && y >= 5 && y <= 19;
    if (scr) {
      let c = [22, 34, 52], e = 0.35;
      if (y === 5 || y === 6) { c = [52, 70, 104]; e = 0.5; }                      // title bar
      else if ((y - 8) % 2 === 0 && y >= 8 && y <= 18) {
        const indent = 6 + ((y * 7) % 4) * 2, len = 6 + ((y * 13) % 11);
        if (x >= indent && x < indent + len) { c = [[120, 220, 160], [240, 200, 110], [130, 180, 250], [230, 120, 150]][((y + x >> 2) & 3)]; e = 0.95; }
      }
      put(d, x, y, c, 0.95 + rng() * 0.05); ctx.emit[k] = e; return;
    }
    if (bez) { put(d, x, y, [30, 30, 34], x === 2 || y === 3 ? 1.3 : 1); return; }
    if (x >= 13 && x <= 18 && y >= 22 && y <= 25) { put(d, x, y, [60, 60, 66]); return; }
    if (x >= 4 && x <= 27 && y >= 27 && y <= 30) { put(d, x, y, ((x + y) & 1) ? [200, 202, 206] : [150, 152, 158], y === 27 ? 1.1 : 1); return; }
    put(d, x, y, [214, 216, 220], 0.92 + rng() * 0.06);
  });
}, { smooth: 0.8, bump: 0.6 });
gen('computer_side', (d, rng) => {
  fillTile(d, (x, y) => {
    if (y >= 3 && y <= 21 && x >= 10 && x <= 30) { put(d, x, y, [44, 44, 50], 0.9 + rng() * 0.1); return; }
    if (y >= 27 && y <= 30) { put(d, x, y, [170, 172, 178]); return; }
    put(d, x, y, [214, 216, 220], 0.92 + rng() * 0.06);
  });
}, { smooth: 0.6, bump: 0.6 });
gen('computer_top', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [206, 208, 212], (x === 0 || y === 0 ? 1.1 : 1) * (0.92 + rng() * 0.06)));
  for (let x = 4; x < 28; x += 2) for (let y = 22; y < 29; y += 2) put(d, x, y, [120, 122, 128]);
}, { smooth: 0.6, bump: 0.6 });
gen('locker_front', (d, rng) => {
  fillTile(d, (x, y) => {
    const door = x % 16, edge = door === 0 || door === 15 || y === 0 || y === 31;
    let c = [58, 104, 150], f = 0.95 + rng() * 0.04;
    if (edge) f = 0.62;
    else if (door === 1 || y === 1) f = 1.15;
    if (y >= 3 && y <= 9 && door >= 4 && door <= 11 && (y & 1)) f = 0.55;          // vents
    if (door === 12 && y >= 14 && y <= 18) { c = [210, 210, 214]; f = 1; }       // handle
    if (y >= 21 && y <= 23 && door >= 5 && door <= 10) { c = [236, 236, 230]; f = 1; } // name tag
    put(d, x, y, c, f);
  });
}, { smooth: 0.7, bump: 1.2 });
gen('locker_side', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [58, 104, 150], (x === 0 || y === 0 ? 1.12 : x === TM || y === TM ? 0.7 : 1) * (0.94 + rng() * 0.05)));
}, { smooth: 0.7, bump: 0.8 });
gen('vending_front', (d, rng, ctx) => {
  const cans = [[220, 50, 50], [60, 120, 220], [250, 190, 50], [60, 180, 90], [240, 240, 240], [240, 120, 40]];
  fillTile(d, (x, y, k) => {
    if (x >= 3 && x <= 21 && y >= 3 && y <= 25) {
      // lit glass window with shelves of cans and bottles
      const row = Math.floor((y - 3) / 6), ry = (y - 3) % 6;
      if (ry === 5) { put(d, x, y, [150, 150, 156]); ctx.emit[k] = 0.3; return; }
      const col = Math.floor((x - 3) / 3), rx = (x - 3) % 3;
      if (rx < 2 && ry >= 1) { put(d, x, y, cans[(row * 3 + col) % cans.length], ry === 1 ? 1.2 : 0.95); ctx.emit[k] = 0.55; return; }
      put(d, x, y, [226, 236, 244], 0.95); ctx.emit[k] = 0.8; return;
    }
    if (x >= 24 && x <= 29 && y >= 5 && y <= 14) { put(d, x, y, (y & 1) ? [30, 30, 34] : [80, 200, 120]); ctx.emit[k] = (y & 1) ? 0 : 0.5; return; }
    if (x >= 24 && x <= 29 && y >= 17 && y <= 20) { put(d, x, y, [40, 40, 44]); return; }
    if (x >= 3 && x <= 21 && y >= 27 && y <= 30) { put(d, x, y, [22, 22, 26]); return; }
    put(d, x, y, [196, 34, 40], (x === 0 || y === 0 ? 1.15 : 1) * (0.94 + rng() * 0.05));
  });
}, { smooth: 0.8, bump: 0.6 });
gen('vending_side', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [196, 34, 40], (x === 0 || y === 0 ? 1.15 : x === TM || y === TM ? 0.72 : 1) * (0.93 + rng() * 0.05)));
  for (let y = 4; y < 28; y += 3) for (let x = 6; x < 26; x++) put(d, x, y, [236, 236, 236], 0.9);
}, { smooth: 0.7, bump: 0.6 });

// ---- streets and sports ----
gen('asphalt', (d, rng) => {
  const f = fbm(rng, 6, 3);
  fillTile(d, (x, y, k) => {
    const grit = rng();
    put(d, x, y, grit < 0.06 ? [96, 96, 98] : grit < 0.1 ? [40, 40, 42] : [58, 59, 62], quant(0.9 + f[k] * 0.16 + rng() * 0.05, 18));
  });
}, { smooth: 0.18, bump: 1.8 });
gen('asphalt_line', (d, rng, ctx) => {
  TEX_GEN.asphalt(d, rng, ctx);
  fillTile(d, (x, y) => { if (x >= 14 && x <= 17 && y >= 4 && y <= 27) put(d, x, y, [236, 236, 228], 0.9 + rng() * 0.1); });
}, { smooth: 0.2, bump: 1.6 });
gen('turf', (d, rng) => {
  fillTile(d, (x, y) => {
    const stripe = Math.floor(x / 16) & 1;
    put(d, x, y, stripe ? [66, 150, 64] : [76, 166, 70], 0.88 + rng() * 0.18);
  });
}, { smooth: 0.1, bump: 1.4 });
gen('turf_line', (d, rng, ctx) => {
  TEX_GEN.turf(d, rng, ctx);
  // painted all over, so lines read continuous whichever way they run
  fillTile(d, (x, y, k) => { const i = k << 2; const t = 0.78 + rng() * 0.1; d[i] = d[i] * (1 - t) + 238 * t; d[i + 1] = d[i + 1] * (1 - t) + 242 * t; d[i + 2] = d[i + 2] * (1 - t) + 236 * t; });
}, { smooth: 0.1, bump: 1 });
gen('turf_side', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, y < 5 ? [70, 156, 66] : [110, 82, 56], 0.88 + rng() * 0.16));
}, { smooth: 0.1, bump: 1.4 });

// recipes and drops of the new blocks
shaped(B.RAIL, 16, ['I I', 'ISI', 'I I'], { I: I.IRON_INGOT, S: I.STICK });
shaped(B.COMPUTER, 1, ['III', 'IGI', 'IRI'], { I: I.IRON_INGOT, G: B.GLASS_PANE, R: B.GLOWSTONE });
shaped(B.LOCKER, 1, ['II', 'II', 'II'], { I: I.IRON_INGOT });
shaped(B.VENDING_MACHINE, 1, ['IGI', 'IAI', 'III'], { I: I.IRON_INGOT, G: B.GLASS_PANE, A: I.APPLE });
shaped(B.ASPHALT, 8, ['GGG', 'GCG', 'GGG'], { G: B.GRAVEL, C: TAG.coal });
shaped(B.ASPHALT_LINE, 4, ['AWA', 'AWA'], { A: B.ASPHALT, W: B.CONCRETE });
shaped(B.TURF, 8, ['WWW', 'WDW', 'WWW'], { W: B.WOOL + 5, D: B.DIRT });
shaped(B.TURF_LINE, 4, ['TWT', 'TWT'], { T: B.TURF, W: B.CONCRETE });
{
  const base = blockDrops;
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (IS_RAIL(id)) return [[B.RAIL, 1]];
    return base(id, toolItem, rnd);
  };
}
