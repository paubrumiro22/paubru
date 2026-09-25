'use strict';
// Procedural 32x32 pixel-art textures (blocks, item sprites, effects), emissive masks,
// normal/smoothness maps, mip chains and UI icons. Everything is painted in code.

const TS = 32, TM = TS - 1, TSS = TS * TS;

function newTile() { return new Uint8ClampedArray(TSS * 4); }
function put(d, x, y, c, f = 1, a = 255) {
  const i = (((y & TM) * TS) + (x & TM)) << 2;
  d[i] = c[0] * f; d[i + 1] = c[1] * f; d[i + 2] = c[2] * f; d[i + 3] = a;
}
function getc(d, x, y) { const i = (((y & TM) * TS) + (x & TM)) << 2; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
function alphaAt(d, x, y) { return x < 0 || y < 0 || x > TM || y > TM ? 0 : d[((y * TS + x) << 2) + 3]; }
function shadec(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
function quant(f, steps) { return Math.round(f * steps) / steps; }
function fillTile(d, fn) { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) fn(x, y, y * TS + x); }
function clearTile(d, c = [80, 120, 60]) { for (let i = 0; i < d.length; i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 0; } }

// Tileable value noise with cx x cy cells.
function smoothField(rng, cx, cy = cx) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const out = new Float32Array(TSS);
  for (let y = 0; y < TS; y++) {
    const fy = (y / TS) * cy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    const r0 = (y0 % cy) * cx, r1 = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < TS; x++) {
      const fx = (x / TS) * cx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const xa = x0 % cx, xb = (x0 + 1) % cx;
      const top = g[r0 + xa] + (g[r0 + xb] - g[r0 + xa]) * sx;
      const bot = g[r1 + xa] + (g[r1 + xb] - g[r1 + xa]) * sx;
      out[y * TS + x] = top + (bot - top) * sy;
    }
  }
  return out;
}
function fbm(rng, cells, oct = 3, gain = 0.5, cy = cells) {
  const out = new Float32Array(TSS);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = smoothField(rng, Math.min(TS, cells << o), Math.min(TS, cy << o));
    for (let i = 0; i < TSS; i++) out[i] += f[i] * amp;
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < TSS; i++) out[i] /= tot;
  return out;
}

// Wrapped Voronoi: nearest cell id, distance to it, (d2 - d1) edge distance and offset to centre.
function voronoi(rng, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([rng() * TS, rng() * TS]);
  const id = new Int16Array(TSS), edge = new Float32Array(TSS), d1a = new Float32Array(TSS);
  const ox = new Float32Array(TSS), oy = new Float32Array(TSS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
    for (let i = 0; i < n; i++) {
      let dx = x + 0.5 - pts[i][0], dy = y + 0.5 - pts[i][1];
      if (dx > TS / 2) dx -= TS; else if (dx < -TS / 2) dx += TS;
      if (dy > TS / 2) dy -= TS; else if (dy < -TS / 2) dy += TS;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < d1) { d2 = d1; d1 = dd; best = i; bx = dx; by = dy; } else if (dd < d2) d2 = dd;
    }
    const k = y * TS + x;
    id[k] = best; edge[k] = d2 - d1; d1a[k] = d1; ox[k] = bx; oy[k] = by;
  }
  return { id, edge, d1: d1a, ox, oy, n };
}

// Bevelled stones (cobble, gravel): light from the top-left along each cell rim.
function stonesFromVoronoi(d, rng, v, colorOf, mortar, mortarW, bevel = 0.3) {
  const grain = fbm(rng, 8, 2);
  fillTile(d, (x, y, k) => {
    const e = v.edge[k];
    if (e < mortarW) { put(d, x, y, mortar, 0.85 + rng() * 0.2 + grain[k] * 0.1); return; }
    const c = colorOf(v.id[k]);
    const l = Math.max(v.d1[k], 1e-3);
    const side = -(v.ox[k] + v.oy[k]) / (l * 1.414);
    const rim = 1 - smoothstep(mortarW, mortarW + 2.6, e);
    let f = (0.9 + grain[k] * 0.2 + rng() * 0.06) * (1 + side * rim * bevel) * (0.86 + 0.14 * Math.min(e / 4, 1));
    put(d, x, y, c, quant(f, 14));
  });
}

const TEX_GEN = {};
const TEX_OPT = {};
function gen(name, fn, opt) { TEX_GEN[name] = fn; if (opt) TEX_OPT[name] = opt; }

// ---------------------------------------------------------------- terrain ----
gen('grass_top', (d, rng) => {
  const f = fbm(rng, 4, 3);
  const base = [96, 150, 56];
  fillTile(d, (x, y, k) => put(d, x, y, base, quant(0.8 + f[k] * 0.34 + rng() * 0.08, 16)));
  for (let i = 0; i < 230; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    const light = rng() < 0.55;
    const c = light ? [128, 190, 76] : [62, 110, 38];
    const len = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < len; j++) put(d, x, y - j, c, 0.92 + rng() * 0.14 + (light ? j * 0.04 : 0));
  }
}, { smooth: 0.16, bump: 1.1 });

function genDirt(d, rng) {
  const f = fbm(rng, 4, 3);
  const base = [132, 94, 64];
  fillTile(d, (x, y, k) => put(d, x, y, base, quant(0.78 + f[k] * 0.36 + rng() * 0.1, 14)));
  for (let i = 0; i < 26; i++) {
    const cx = Math.floor(rng() * TS), cy = Math.floor(rng() * TS);
    const light = rng() < 0.5;
    const c = light ? [160, 124, 90] : [92, 64, 44];
    const r = rng() < 0.4 ? 2 : 1;
    for (let y = 0; y < r; y++) for (let x = 0; x < r + (rng() < 0.5 ? 1 : 0); x++) put(d, cx + x, cy + y, c, 0.92 + rng() * 0.12);
    if (light) put(d, cx - 1, cy + r, [74, 50, 34]);
  }
  for (let i = 0; i < 90; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), rng() < 0.5 ? [150, 110, 78] : [100, 70, 48]);
}
gen('dirt', genDirt, { smooth: 0.04, bump: 1.5 });

function grassOverhang(d, rng, cols, minD, maxD) {
  const prof = smoothField(rng, 6, 1);
  for (let x = 0; x < TS; x++) {
    let depth = Math.floor(minD + prof[x] * (maxD - minD) + rng() * 2);
    if (rng() < 0.12) depth += 2 + Math.floor(rng() * 3);
    for (let y = 0; y < depth; y++) {
      const t = y / depth;
      const c = y === depth - 1 ? cols[2] : mixc(cols[0], cols[1], t);
      put(d, x, y, c, quant(0.9 + rng() * 0.16, 12));
    }
    if (rng() < 0.3) put(d, x, depth, shadec(cols[2], 0.8));
  }
}
gen('grass_side', (d, rng) => {
  genDirt(d, rng);
  grassOverhang(d, rng, [[112, 170, 64], [86, 140, 50], [58, 102, 36]], 5, 10);
}, { smooth: 0.06, bump: 1.4 });

function genStone(d, rng, base = [126, 126, 128], crack = [94, 94, 96]) {
  const f = fbm(rng, 4, 4, 0.55);
  fillTile(d, (x, y, k) => put(d, x, y, base, quant(0.8 + f[k] * 0.4 + rng() * 0.05, 12)));
  for (let k = 0; k < 11; k++) {
    let x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    const len = 3 + Math.floor(rng() * 6);
    for (let i = 0; i < len; i++) {
      put(d, x, y, crack, 0.95 + rng() * 0.08);
      if (rng() < 0.3) put(d, x, y + 1, shadec(base, 1.08));
      x++; if (rng() < 0.4) y += rng() < 0.5 ? 1 : -1;
    }
  }
  for (let i = 0; i < 40; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), shadec(base, 1.12 + rng() * 0.06));
}
gen('stone', (d, rng) => genStone(d, rng), { smooth: 0.24, bump: 1.7 });

gen('cobble', (d, rng) => {
  const v = voronoi(rng, 13);
  const br = Array.from({ length: 13 }, () => 0.78 + rng() * 0.36);
  stonesFromVoronoi(d, rng, v, (i) => shadec([132, 132, 134], br[i]), [58, 58, 62], 1.1, 0.34);
}, { smooth: 0.18, bump: 2.6 });

gen('mossy_cobble', (d, rng) => {
  const v = voronoi(rng, 13);
  const br = Array.from({ length: 13 }, () => 0.78 + rng() * 0.36);
  stonesFromVoronoi(d, rng, v, (i) => shadec([130, 132, 128], br[i]), [54, 58, 52], 1.1, 0.34);
  const moss = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => {
    const m = moss[k] + (v.edge[k] < 2 ? 0.14 : 0) + (y < 10 ? 0.06 : 0);
    if (m > 0.55) put(d, x, y, [86, 124, 52], quant(0.8 + rng() * 0.35, 10));
  });
}, { smooth: 0.14, bump: 2.4 });

gen('sand', (d, rng) => {
  const f = fbm(rng, 4, 2);
  const w = fbm(rng, 2, 2);
  fillTile(d, (x, y, k) => {
    const rip = 0.035 * Math.sin((y * 0.9 + x * 0.25 + w[k] * 9));
    put(d, x, y, [222, 206, 160], quant(0.93 + f[k] * 0.1 + rip + rng() * 0.05, 24));
  });
  for (let i = 0; i < 120; i++) {
    const r = rng();
    put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), r < 0.5 ? [196, 178, 132] : r < 0.8 ? [240, 230, 196] : [176, 150, 112]);
  }
}, { smooth: 0.06, bump: 0.8 });

gen('gravel', (d, rng) => {
  const v = voronoi(rng, 34);
  const pal = [[136, 130, 126], [106, 102, 100], [156, 146, 136], [124, 112, 102], [92, 90, 88], [146, 140, 138]];
  const cols = Array.from({ length: 34 }, () => pal[Math.floor(rng() * pal.length)]);
  stonesFromVoronoi(d, rng, v, (i) => cols[i], [66, 62, 60], 0.9, 0.4);
}, { smooth: 0.1, bump: 2.6 });

gen('clay', (d, rng) => {
  const f = fbm(rng, 3, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [162, 168, 182], quant(0.9 + f[k] * 0.14 + rng() * 0.04, 20)));
  for (let i = 0; i < 40; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), rng() < 0.5 ? [142, 148, 162] : [180, 186, 198]);
}, { smooth: 0.3, bump: 0.7 });

gen('bedrock', (d, rng) => {
  const pal = [[30, 30, 32], [66, 66, 68], [108, 108, 110], [48, 48, 50], [146, 146, 148], [84, 84, 86]];
  const s = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => {
    const idx = Math.min(pal.length - 1, Math.floor((s[k] * 0.65 + rng() * 0.35) * pal.length));
    put(d, x, y, pal[idx], 0.92 + rng() * 0.14);
  });
}, { smooth: 0.1, bump: 2.4 });

gen('snow_top', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [238, 244, 252], quant(0.95 + f[k] * 0.06 + rng() * 0.02, 30)));
  for (let i = 0; i < 70; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), rng() < 0.6 ? [214, 228, 246] : [255, 255, 255]);
}, { smooth: 0.45, bump: 0.5 });

gen('snow_side', (d, rng) => {
  genDirt(d, rng);
  const prof = smoothField(rng, 5, 1);
  for (let x = 0; x < TS; x++) {
    let depth = Math.floor(6 + prof[x] * 5 + rng() * 2);
    if (rng() < 0.1) depth += 3;
    for (let y = 0; y < depth; y++) put(d, x, y, y === depth - 1 ? [196, 210, 230] : [238, 244, 250], 0.94 + rng() * 0.06);
  }
}, { smooth: 0.3, bump: 1.0 });

gen('ice', (d, rng) => {
  const f = fbm(rng, 3, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [150, 190, 242], quant(0.88 + f[k] * 0.16, 16)));
  for (let k = 0; k < 9; k++) {
    let x = rng() * TS, y = rng() * TS;
    const a = rng() * Math.PI;
    const len = 4 + rng() * 10;
    for (let i = 0; i < len; i++) { put(d, Math.floor(x), Math.floor(y), [226, 240, 255]); x += Math.cos(a); y += Math.sin(a); }
  }
}, { smooth: 0.92, bump: 0.3 });

function genBark(d, rng, base, dark) {
  const ridge = smoothField(rng, 8, 1);
  const fine = fbm(rng, 2, 3, 0.5, 8);
  fillTile(d, (x, y, k) => {
    const sway = Math.round(Math.sin(y * 0.4 + x) * 0.7);
    const r = ridge[((x + sway) & TM)];
    let f = 0.72 + r * 0.42 + fine[k] * 0.14 + rng() * 0.05;
    if (r < 0.28) { put(d, x, y, dark, 0.9 + rng() * 0.15); return; }
    put(d, x, y, base, quant(f, 12));
  });
  for (let k = 0; k < 2; k++) {
    const cx = Math.floor(rng() * TS), cy = Math.floor(rng() * TS);
    for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) put(d, cx + x, cy + y, dark, Math.abs(x) + Math.abs(y) < 2 ? 0.8 : 1.05);
  }
}
function genRings(d, rng, inner, outer, bark) {
  const w = fbm(rng, 3, 2);
  fillTile(d, (x, y, k) => {
    const r = Math.hypot(x - 15.5, y - 15.5);
    if (r > 14.2 || x === 0 || y === 0 || x === TM || y === TM) { put(d, x, y, bark, 0.85 + rng() * 0.25); return; }
    const t = r + w[k] * 2.2;
    const ring = (t / 2.7) % 1;
    let c = mixc(inner, outer, 0.5 + 0.5 * Math.sin(t * 1.1));
    let f = 0.95 + rng() * 0.08;
    if (ring < 0.22) f *= 0.8;
    if (r > 12.8) f *= 0.85;
    put(d, x, y, c, quant(f, 14));
  });
  let a = rng() * Math.PI * 2;
  for (let i = 3; i < 12; i++) put(d, Math.round(15.5 + Math.cos(a) * i), Math.round(15.5 + Math.sin(a) * i), shadec(outer, 0.7));
}
gen('log_side', (d, rng) => genBark(d, rng, [108, 84, 52], [58, 42, 26]), { smooth: 0.08, bump: 2.2 });
gen('log_top', (d, rng) => genRings(d, rng, [190, 154, 100], [156, 120, 74], [104, 80, 50]), { smooth: 0.1, bump: 1.4 });
gen('spruce_side', (d, rng) => genBark(d, rng, [76, 56, 36], [40, 28, 18]), { smooth: 0.08, bump: 2.2 });
gen('spruce_top', (d, rng) => genRings(d, rng, [160, 120, 76], [124, 90, 56], [72, 52, 34]), { smooth: 0.1, bump: 1.4 });
gen('birch_side', (d, rng) => {
  const f = fbm(rng, 3, 2);
  fillTile(d, (x, y, k) => put(d, x, y, [222, 220, 212], quant(0.9 + f[k] * 0.12 + rng() * 0.04, 20)));
  for (let k = 0; k < 13; k++) {
    const y = Math.floor(rng() * TS), x = Math.floor(rng() * TS);
    const len = 3 + Math.floor(rng() * 7);
    const thick = rng() < 0.45 ? 2 : 1;
    for (let i = 0; i < len; i++) for (let t = 0; t < thick; t++) {
      if (t && (i === 0 || i === len - 1)) continue;
      put(d, x + i, y + t, [46, 42, 40], 0.9 + rng() * 0.3);
    }
  }
  for (let i = 0; i < 30; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), [196, 192, 180]);
}, { smooth: 0.16, bump: 1.2 });
gen('birch_top', (d, rng) => genRings(d, rng, [210, 190, 140], [180, 160, 112], [222, 220, 212]), { smooth: 0.1, bump: 1.4 });

function genLeaves(d, rng, base, density) {
  clearTile(d, base);
  const n = Math.floor(95 * density);
  for (let i = 0; i < n; i++) {
    const cx = rng() * TS, cy = rng() * TS;
    const a = rng() * Math.PI, rx = 1.6 + rng() * 1.6, ry = 1 + rng() * 0.9;
    const f0 = 0.72 + rng() * 0.46;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const px = Math.floor(cx) + x, py = Math.floor(cy) + y;
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
      if (u * u + v * v > 1) continue;
      put(d, px, py, base, quant(f0 * (1 - 0.18 * v) * (0.95 + rng() * 0.1), 10));
    }
  }
}
gen('leaves', (d, rng) => genLeaves(d, rng, [84, 150, 58], 1), { smooth: 0.35, bump: 1.2 });
gen('birch_leaves', (d, rng) => genLeaves(d, rng, [124, 170, 80], 1), { smooth: 0.35, bump: 1.2 });
gen('spruce_leaves', (d, rng) => genLeaves(d, rng, [60, 102, 66], 1.25), { smooth: 0.35, bump: 1.2 });

function genPlanks(d, rng, base) {
  const grain = fbm(rng, 2, 3, 0.5, 16);
  const boardF = [], joint = [];
  for (let r = 0; r < 4; r++) { boardF.push(0.86 + rng() * 0.2); joint.push(Math.floor(rng() * TS)); }
  fillTile(d, (x, y, k) => {
    const row = y >> 3, ry = y & 7;
    let f = boardF[row] * (0.88 + grain[k] * 0.22);
    if (ry === 7) f *= 0.62; else if (ry === 0) f *= 1.08; else if (ry === 6) f *= 0.9;
    if (Math.abs(x - joint[row]) < 1 && ry !== 7) f *= 0.66;
    if (Math.abs(x - joint[row]) === 1 && ry !== 7) f *= 1.06;
    put(d, x, y, base, quant(f, 12));
  });
  for (let r = 0; r < 4; r++) for (const dx of [-3, 3]) put(d, joint[r] + dx, r * 8 + 3, shadec(base, 0.55));
}
gen('planks', (d, rng) => genPlanks(d, rng, [180, 142, 90]), { smooth: 0.24, bump: 1.4 });
gen('birch_planks', (d, rng) => genPlanks(d, rng, [212, 192, 138]), { smooth: 0.24, bump: 1.4 });
gen('spruce_planks', (d, rng) => genPlanks(d, rng, [118, 86, 54]), { smooth: 0.24, bump: 1.4 });

gen('glass', (d) => {
  clearTile(d, [200, 230, 240]);
  fillTile(d, (x, y) => {
    const b = x === 0 || y === 0 || x === TM || y === TM;
    const b2 = x === 1 || y === 1 || x === TM - 1 || y === TM - 1;
    if (b) put(d, x, y, [196, 222, 230]);
    else if (b2 && (x + y) % 3 !== 0) put(d, x, y, [226, 242, 248]);
  });
  const streak = (x0, y0, n) => { for (let i = 0; i < n; i++) put(d, x0 + i, y0 - i, [240, 250, 254]); };
  streak(6, 14, 7); streak(7, 16, 3); streak(16, 26, 9); streak(21, 11, 4);
}, { smooth: 0.95, bump: 0 });

function genOre(d, rng, ctx, ore, hi, dark) {
  genStone(d, rng);
  const n = 6 + Math.floor(rng() * 2);
  for (let c = 0; c < n; c++) {
    const cx = 3 + Math.floor(rng() * 26), cy = 3 + Math.floor(rng() * 26);
    const cells = [];
    const size = 4 + Math.floor(rng() * 5);
    let x = cx, y = cy;
    for (let i = 0; i < size; i++) { cells.push([x, y]); if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else y += rng() < 0.5 ? 1 : -1; }
    for (const [px, py] of cells) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(d, px + ox, py + oy, dark, 0.95 + rng() * 0.1);
    cells.forEach(([px, py], i) => {
      put(d, px, py, i === 0 ? hi : ore, 0.9 + rng() * 0.16);
      ctx.smooth[(py & TM) * TS + (px & TM)] = 0.85;
    });
  }
}
gen('coal_ore', (d, rng, c) => genOre(d, rng, c, [38, 38, 40], [88, 88, 92], [70, 70, 72]), { bump: 1.8 });
gen('iron_ore', (d, rng, c) => genOre(d, rng, c, [214, 172, 142], [242, 214, 190], [96, 88, 84]), { bump: 1.8 });
gen('gold_ore', (d, rng, c) => genOre(d, rng, c, [250, 208, 58], [255, 246, 156], [110, 96, 60]), { bump: 1.8 });
gen('diamond_ore', (d, rng, c) => genOre(d, rng, c, [88, 228, 218], [214, 255, 252], [60, 110, 108]), { bump: 1.8 });

gen('granite', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [160, 108, 88], quant(0.84 + f[k] * 0.3 + rng() * 0.06, 12)));
  for (let i = 0; i < 90; i++) {
    const r = rng();
    put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), r < 0.4 ? [110, 70, 60] : r < 0.8 ? [196, 144, 124] : [230, 206, 196]);
  }
}, { smooth: 0.3, bump: 1.4 });
gen('diorite', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [206, 206, 204], quant(0.88 + f[k] * 0.16, 16)));
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    put(d, x, y, [90, 90, 92]); if (rng() < 0.5) put(d, x + 1, y, [120, 120, 122]);
  }
}, { smooth: 0.34, bump: 1.4 });
gen('andesite', (d, rng) => {
  const f = fbm(rng, 3, 4, 0.6);
  fillTile(d, (x, y, k) => put(d, x, y, [134, 136, 136], quant(0.8 + f[k] * 0.36 + rng() * 0.06, 10)));
}, { smooth: 0.24, bump: 1.6 });

function bevelFrame(d, x0, y0, x1, y1, hi = 1.14, lo = 0.78) {
  for (let x = x0; x <= x1; x++) { const t = getc(d, x, y0); put(d, x, y0, t, hi); const b = getc(d, x, y1); put(d, x, y1, b, lo); }
  for (let y = y0 + 1; y < y1; y++) { const l = getc(d, x0, y); put(d, x0, y, l, hi); const r = getc(d, x1, y); put(d, x1, y, r, lo); }
}
gen('smooth_stone', (d, rng) => {
  const f = fbm(rng, 3, 2);
  fillTile(d, (x, y, k) => put(d, x, y, [160, 160, 162], quant(0.94 + f[k] * 0.08 + rng() * 0.03, 24)));
  bevelFrame(d, 0, 0, TM, TM, 1.12, 0.72);
  bevelFrame(d, 1, 1, TM - 1, TM - 1, 1.04, 0.9);
}, { smooth: 0.3, bump: 1.6 });

gen('sandstone_side', (d, rng) => {
  const f = fbm(rng, 3, 2, 0.5, 6);
  fillTile(d, (x, y, k) => {
    let c = [218, 204, 152], fa = 0.95 + f[k] * 0.08 + 0.03 * Math.sin(y * 1.3);
    if (y < 5) fa *= 1.05;
    if (y === 5) fa *= 0.82;
    if (y > 24) { c = [206, 190, 140]; if (y === 25) fa *= 0.84; }
    put(d, x, y, c, quant(fa * (0.97 + rng() * 0.05), 20));
  });
}, { smooth: 0.1, bump: 1.4 });
gen('sandstone_top', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [222, 208, 160], quant(0.93 + f[k] * 0.1 + rng() * 0.04, 20)));
}, { smooth: 0.1, bump: 0.9 });
gen('sandstone_bottom', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [206, 190, 140], quant(0.9 + f[k] * 0.14 + rng() * 0.06, 16)));
}, { smooth: 0.1, bump: 1.2 });

gen('bricks', (d, rng) => {
  const bf = Array.from({ length: 16 }, () => 0.82 + rng() * 0.28);
  const f = fbm(rng, 8, 2);
  fillTile(d, (x, y, k) => {
    const row = y >> 3, ry = y & 7, xo = (x + (row & 1) * 8) & TM, rx = xo & 15;
    if (ry === 7 || rx === 15) { put(d, x, y, [178, 170, 160], 0.9 + rng() * 0.12); return; }
    let fa = bf[row * 2 + (xo >> 4)] * (0.9 + f[k] * 0.14 + rng() * 0.08);
    if (ry === 0 || rx === 0) fa *= 1.1;
    if (ry === 6 || rx === 14) fa *= 0.84;
    put(d, x, y, [154, 74, 58], quant(fa, 14));
  });
}, { smooth: 0.14, bump: 2.4 });

gen('stone_bricks', (d, rng) => {
  const bf = Array.from({ length: 8 }, () => 0.86 + rng() * 0.18);
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => {
    const row = y >> 4, ry = y & 15, xo = (x + (row & 1) * 16) & TM, rx = xo & 15;
    if (ry === 15 || rx === 15) { put(d, x, y, [86, 86, 88], 0.92 + rng() * 0.1); return; }
    let fa = bf[row * 2 + (xo >> 4)] * (0.9 + f[k] * 0.16 + rng() * 0.05);
    if (ry === 0 || rx === 0) fa *= 1.1;
    if (ry === 14 || rx === 14) fa *= 0.84;
    put(d, x, y, [138, 138, 140], quant(fa, 16));
  });
  let x = 6, y = 20;
  for (let i = 0; i < 7; i++) { put(d, x, y, [92, 92, 94]); x++; if (rng() < 0.5) y++; }
}, { smooth: 0.2, bump: 2.4 });

gen('terracotta', (d, rng) => {
  const f = fbm(rng, 3, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [156, 96, 70], quant(0.92 + f[k] * 0.1 + rng() * 0.04, 20)));
}, { smooth: 0.2, bump: 0.8 });

function genMetal(d, rng, base, facets) {
  const f = fbm(rng, 2, 2, 0.5, 8);
  fillTile(d, (x, y, k) => {
    let fa = 0.92 + f[k] * 0.12;
    if (facets) { const a = (x + y) & 15; fa *= a < 8 ? 1.06 : 0.95; }
    put(d, x, y, base, quant(fa, 20));
  });
  bevelFrame(d, 0, 0, TM, TM, 1.22, 0.66);
  bevelFrame(d, 1, 1, TM - 1, TM - 1, 1.1, 0.82);
  for (let i = 3; i < TM - 2; i++) { put(d, i, 15, base, 0.8); put(d, i, 16, base, 1.12); put(d, 15, i, base, 0.8); put(d, 16, i, base, 1.12); }
  for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27]]) { put(d, x, y, base, 1.3); put(d, x + 1, y + 1, base, 0.7); }
}
gen('iron_block', (d, rng) => genMetal(d, rng, [214, 214, 214], false), { smooth: 0.7, bump: 1.6 });
gen('gold_block', (d, rng) => genMetal(d, rng, [248, 208, 72], false), { smooth: 0.85, bump: 1.6 });
gen('diamond_block', (d, rng) => genMetal(d, rng, [104, 222, 214], true), { smooth: 0.9, bump: 1.6 });
gen('coal_block', (d, rng) => {
  const v = voronoi(rng, 10);
  stonesFromVoronoi(d, rng, v, () => [52, 52, 56], [22, 22, 24], 0.8, 0.5);
}, { smooth: 0.5, bump: 2.2 });

gen('obsidian', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => {
    const v = f[k];
    const c = v > 0.62 ? [66, 42, 96] : v > 0.5 ? [40, 26, 60] : [20, 14, 32];
    put(d, x, y, c, 0.9 + rng() * 0.15);
  });
  for (let i = 0; i < 16; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), [110, 84, 150]);
}, { smooth: 0.85, bump: 1.4 });

gen('glowstone', (d, rng, ctx) => {
  const v = voronoi(rng, 12);
  const pal = [[254, 218, 124], [240, 176, 80], [210, 146, 64], [255, 238, 176]];
  const cols = Array.from({ length: 12 }, () => pal[Math.floor(rng() * pal.length)]);
  fillTile(d, (x, y, k) => {
    if (v.edge[k] < 1.1) { put(d, x, y, [128, 84, 40], 0.9 + rng() * 0.2); ctx.emit[k] = 0.15; return; }
    const hot = rng() < 0.08;
    put(d, x, y, hot ? [255, 250, 214] : cols[v.id[k]], hot ? 1 : quant(0.9 + rng() * 0.14, 10));
    ctx.emit[k] = 1;
  });
}, { smooth: 0.3, bump: 1.5 });

gen('water', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [48, 100, 196], 0.85 + f[k] * 0.3, 210));
}, { smooth: 0.9, bump: 0 });

gen('lava', (d, rng, ctx) => {
  const f = fbm(rng, 3, 4, 0.55);
  const v = voronoi(rng, 9);
  fillTile(d, (x, y, k) => {
    const t = clamp(f[k] * 1.25 - 0.12 + (v.edge[k] < 1.5 ? -0.25 : 0), 0, 1);
    const c = t < 0.35 ? mixc([110, 18, 4], [200, 60, 8], t / 0.35) : t < 0.75 ? mixc([200, 60, 8], [250, 140, 20], (t - 0.35) / 0.4) : mixc([250, 140, 20], [255, 226, 110], (t - 0.75) / 0.25);
    put(d, x, y, c, quant(0.96 + rng() * 0.06, 16));
    ctx.emit[k] = 0.55 + 0.45 * t;
  });
}, { smooth: 0.5, bump: 1.0 });

gen('cactus_side', (d, rng) => {
  fillTile(d, (x, y) => {
    let f = 0.92 + rng() * 0.1;
    const rx = x % 8;
    if (rx === 0) f *= 0.72; else if (rx === 1 || rx === 7) f *= 0.86; else if (rx === 4) f *= 1.08;
    if (x < 2 || x > TM - 2) f *= 0.74;
    put(d, x, y, [84, 138, 54], quant(f, 12));
  });
  for (let x = 4; x < TS; x += 8) for (let y = 3 + ((x >> 3) & 1) * 4; y < TS; y += 8) {
    put(d, x, y, [236, 232, 196]); put(d, x, y - 1, [70, 60, 40]);
  }
}, { smooth: 0.3, bump: 1.6 });
gen('cactus_top', (d, rng) => {
  fillTile(d, (x, y) => {
    const r = Math.hypot(x - 15.5, y - 15.5), a = Math.atan2(y - 15.5, x - 15.5);
    let f = 0.92 + rng() * 0.08;
    if (r > 13) f *= 0.72; else if (r < 5) f *= 1.1;
    if (Math.abs(Math.sin(a * 4)) < 0.2 && r > 5) f *= 0.84;
    put(d, x, y, [98, 152, 62], quant(f, 12));
  });
}, { smooth: 0.3, bump: 1.2 });
gen('cactus_bottom', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [86, 128, 56], 0.9 + rng() * 0.1));
}, { smooth: 0.3, bump: 1.0 });

// ------------------------------------------------------------- plants ----
function stem(d, pts, col, w = 1) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let s = 0; s <= n; s++) {
      const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n;
      for (let k = 0; k < w; k++) put(d, Math.floor(x) + k, Math.floor(y), col);
    }
  }
}
function blade(d, rng, x0, h, lean, col, curl = 0) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const x = Math.round(x0 + lean * i + curl * t * t * h);
    const y = TM - i;
    if (x < 0 || x > TM) break;
    put(d, x, y, col, 0.66 + 0.42 * t);
    if (i < h * 0.45 && rng() < 0.7) put(d, x + 1, y, col, 0.6 + 0.3 * t);
  }
}
gen('tallgrass', (d, rng) => {
  clearTile(d, [100, 140, 70]);
  for (let b = 0; b < 22; b++) {
    const c = [104 + rng() * 40, 150 + rng() * 40, 68 + rng() * 22];
    blade(d, rng, 2 + rng() * 28, 10 + Math.floor(rng() * 20), (rng() - 0.5) * 0.5, c, (rng() - 0.5) * 3);
  }
}, { smooth: 0.25, bump: 0.3 });
gen('fern', (d, rng) => {
  clearTile(d, [90, 130, 70]);
  for (let f = 0; f < 5; f++) {
    const x0 = 8 + rng() * 16, lean = (rng() - 0.5) * 0.9, h = 16 + Math.floor(rng() * 12);
    for (let i = 0; i < h; i++) {
      const x = Math.round(x0 + lean * i), y = TM - i;
      put(d, x, y, [86, 132, 60], 0.8);
      if (i > 3 && i % 2 === 0) {
        const len = Math.max(1, Math.round((1 - i / h) * 5));
        for (let j = 1; j <= len; j++) { put(d, x - j, y - (j >> 1), [110, 160, 74], 1 - j * 0.05); put(d, x + j, y - (j >> 1), [96, 146, 66], 1 - j * 0.05); }
      }
    }
  }
}, { smooth: 0.25, bump: 0.3 });
function flowerBase(d, rng, stemTop) {
  clearTile(d, [70, 120, 50]);
  stem(d, [[15, 31], [15, stemTop], [16, stemTop - 2]], [58, 124, 40], 2);
  for (const [lx, ly, dir] of [[14, 24, -1], [17, 21, 1]]) {
    for (let i = 0; i < 5; i++) put(d, lx + dir * i, ly - Math.floor(i * 0.6), [70, 146, 48], 1 - i * 0.04);
    for (let i = 1; i < 4; i++) put(d, lx + dir * i, ly - Math.floor(i * 0.6) + 1, [54, 118, 36]);
  }
}
gen('rose', (d, rng) => {
  flowerBase(d, rng, 14);
  fillTile(d, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 10);
    if (r > 6.2) return;
    const a = Math.atan2(y - 10, x - 16);
    const swirl = Math.sin(r * 1.6 + a * 2);
    put(d, x, y, [208, 34, 42], quant((0.82 + 0.22 * swirl) * (y < 9 ? 1.1 : 0.94), 10));
  });
  put(d, 15, 9, [120, 12, 20]); put(d, 16, 10, [120, 12, 20]);
}, { smooth: 0.3, bump: 0.3 });
gen('dandelion', (d, rng) => {
  flowerBase(d, rng, 16);
  fillTile(d, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 12);
    if (r > 5 + rng() * 0.8) return;
    put(d, x, y, r < 2 ? [236, 170, 30] : [252, 224, 56], quant(0.88 + rng() * 0.16 + (y < 12 ? 0.08 : 0), 10));
  });
}, { smooth: 0.3, bump: 0.3 });
gen('tulip', (d, rng) => {
  flowerBase(d, rng, 15);
  const cup = (x, y) => y >= 6 && y <= 15 && Math.abs(x + 0.5 - 16) <= 4.6 - Math.max(0, 12 - y) * 0.15 - Math.max(0, y - 12) * 0.9;
  fillTile(d, (x, y) => {
    if (!cup(x, y)) return;
    if (y < 9 && (x === 15 || x === 16 || x === 12 || x === 19)) return;
    const f = x < 16 ? 1.08 : 0.9;
    put(d, x, y, [244, 128, 36], quant(f * (0.9 + rng() * 0.1), 10));
  });
}, { smooth: 0.3, bump: 0.3 });
gen('bluebell', (d, rng) => {
  clearTile(d, [70, 120, 50]);
  stem(d, [[14, 31], [14, 12], [16, 7], [20, 6], [23, 8]], [60, 126, 44], 1);
  for (let i = 0; i < 4; i++) put(d, 13 - i, 27 - i, [70, 146, 48]);
  for (const [bx, by] of [[17, 9], [21, 10], [23, 13], [13, 14]]) {
    for (let y = 0; y < 4; y++) for (let x = -1 - (y >> 1); x <= 1 + (y >> 1); x++) put(d, bx + x, by + y, [70, 96, 222], y === 3 ? 0.8 : 1 - x * 0.06);
  }
}, { smooth: 0.3, bump: 0.3 });
gen('red_mushroom', (d, rng) => {
  clearTile(d, [200, 60, 50]);
  for (let y = 18; y < 31; y++) for (let x = 13; x < 19; x++) put(d, x, y, [226, 214, 196], x === 13 ? 0.84 : 1);
  fillTile(d, (x, y) => {
    const dx = (x + 0.5 - 16) / 9.5, dy = (y + 0.5 - 18) / 8;
    if (y > 18 || dx * dx + dy * dy > 1) return;
    put(d, x, y, [214, 36, 36], quant(1.05 - (y - 10) * 0.02 - dx * 0.1, 10));
  });
  for (const [x, y] of [[12, 13], [18, 11], [21, 15], [15, 16], [9, 16]]) { put(d, x, y, [248, 244, 236]); put(d, x + 1, y, [248, 244, 236]); put(d, x, y + 1, [232, 226, 214]); }
}, { smooth: 0.3, bump: 0.3 });
gen('brown_mushroom', (d, rng) => {
  clearTile(d, [150, 110, 80]);
  for (let y = 21; y < 31; y++) for (let x = 14; x < 18; x++) put(d, x, y, [214, 200, 178], x === 14 ? 0.85 : 1);
  fillTile(d, (x, y) => {
    const dx = (x + 0.5 - 16) / 10, dy = (y + 0.5 - 21) / 4.5;
    if (y > 21 || dx * dx + dy * dy > 1) return;
    put(d, x, y, [158, 116, 84], quant(1 - (y - 17) * 0.05 + rng() * 0.08, 10));
  });
}, { smooth: 0.3, bump: 0.3 });
gen('dead_bush', (d, rng) => {
  clearTile(d, [120, 90, 50]);
  const branch = (x, y, a, len, depth) => {
    for (let i = 0; i < len; i++) { put(d, Math.round(x), Math.round(y), [128, 90, 48], 0.8 + rng() * 0.3); x += Math.cos(a); y += Math.sin(a); }
    if (depth > 0) { branch(x, y, a - 0.5 - rng() * 0.4, len * 0.7, depth - 1); branch(x, y, a + 0.5 + rng() * 0.4, len * 0.7, depth - 1); }
  };
  branch(16, 31, -Math.PI / 2, 8, 3);
}, { smooth: 0.2, bump: 0.3 });
function genSapling(d, rng, trunk, leaf, conical) {
  clearTile(d, leaf);
  stem(d, [[15, 31], [15, 18]], trunk, 2);
  if (conical) {
    for (let y = 4; y < 26; y++) {
      const w = Math.floor((y - 4) * 0.45) + ((y & 3) === 0 ? -1 : 0);
      for (let x = -w; x <= w; x++) put(d, 16 + x, y, leaf, quant(0.8 + rng() * 0.3 - (y & 3) * 0.04, 8));
    }
  } else {
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, r = rng() * 8;
      const x = Math.round(16 + Math.cos(a) * r * 1.1), y = Math.round(12 + Math.sin(a) * r * 0.9);
      put(d, x, y, leaf, 0.8 + rng() * 0.35); put(d, x + 1, y, leaf, 0.75 + rng() * 0.3); put(d, x, y + 1, leaf, 0.7 + rng() * 0.2);
    }
  }
}
gen('oak_sapling', (d, rng) => genSapling(d, rng, [104, 78, 46], [78, 146, 52], false), { smooth: 0.3, bump: 0.3 });
gen('birch_sapling', (d, rng) => genSapling(d, rng, [222, 220, 210], [120, 172, 78], false), { smooth: 0.3, bump: 0.3 });
gen('spruce_sapling', (d, rng) => genSapling(d, rng, [76, 56, 36], [56, 100, 62], true), { smooth: 0.3, bump: 0.3 });
function genWheat(d, rng, stage) {
  clearTile(d, [120, 160, 60]);
  const h = [9, 16, 23, 28][stage];
  const col = stage < 2 ? [84, 160, 52] : stage === 2 ? [150, 170, 60] : [214, 184, 76];
  for (let b = 0; b < 9; b++) {
    const x0 = 3 + b * 3.3 + rng() * 1.5, hh = h - Math.floor(rng() * 5);
    for (let i = 0; i < hh; i++) put(d, Math.round(x0 + (rng() - 0.5) * 0.6), TM - i, col, 0.72 + 0.38 * i / hh);
    if (stage >= 2) {
      for (let i = 0; i < 6; i++) {
        const y = TM - hh + i + 1;
        put(d, Math.round(x0) - 1, y, stage === 3 ? [236, 206, 96] : [176, 186, 76], 1 - i * 0.04);
        put(d, Math.round(x0) + 1, y, stage === 3 ? [196, 160, 60] : [140, 160, 60], 1 - i * 0.04);
      }
    }
  }
}
for (let s = 0; s < 4; s++) gen('wheat_' + s, (d, rng) => genWheat(d, rng, s), { smooth: 0.25, bump: 0.3 });
gen('sugar_cane', (d, rng) => {
  clearTile(d, [140, 190, 110]);
  for (const x0 of [6, 15, 24]) {
    for (let y = 0; y < TS; y++) {
      const joint = ((y + x0) % 10) === 0;
      put(d, x0, y, [150, 200, 110], joint ? 0.7 : 1.05);
      put(d, x0 + 1, y, [130, 186, 96], joint ? 0.65 : 0.95);
      put(d, x0 + 2, y, [104, 156, 76], joint ? 0.6 : 0.9);
    }
    for (let i = 0; i < 5; i++) put(d, x0 + 3 + i, 8 + x0 % 7 + i, [120, 176, 88], 1 - i * 0.05);
  }
}, { smooth: 0.3, bump: 0.6 });

// ----------------------------------------------------- functional blocks ----
gen('crafting_top', (d, rng) => {
  genPlanks(d, rng, [170, 130, 80]);
  fillTile(d, (x, y) => {
    const border = x < 3 || y < 3 || x > TM - 3 || y > TM - 3;
    if (border) { put(d, x, y, [110, 80, 46], (x < 1 || y < 1 || x > TM - 1 || y > TM - 1) ? 0.8 : 1); return; }
    const gx = (x - 3) % 9, gy = (y - 3) % 9;
    if (gx === 8 || gy === 8) put(d, x, y, [92, 66, 38]);
  });
}, { smooth: 0.22, bump: 1.6 });
gen('crafting_side', (d, rng) => {
  genPlanks(d, rng, [176, 138, 86]);
  for (let x = 0; x < TS; x++) for (let y = 0; y < 5; y++) put(d, x, y, [112, 82, 48], y === 4 ? 0.7 : 1);
  // saw
  for (let x = 5; x < 16; x++) for (let y = 9; y < 14 - ((x - 5) >> 2); y++) put(d, x, y, [200, 200, 204], y === 9 ? 1.1 : 0.95);
  for (let x = 5; x < 16; x += 2) put(d, x, 13 - ((x - 5) >> 2), [140, 140, 146]);
  for (let y = 8; y < 15; y++) { put(d, 16, y, [120, 76, 40]); put(d, 17, y, [100, 62, 32]); }
  // hammer
  for (let y = 10; y < 27; y++) put(d, 24, y, [118, 80, 44]);
  for (let x = 20; x < 29; x++) for (let y = 8; y < 12; y++) put(d, x, y, [90, 90, 96], y === 8 ? 1.3 : 1);
}, { smooth: 0.22, bump: 1.6 });
gen('crafting_front', (d, rng) => {
  genPlanks(d, rng, [176, 138, 86]);
  for (let x = 0; x < TS; x++) for (let y = 0; y < 5; y++) put(d, x, y, [112, 82, 48], y === 4 ? 0.7 : 1);
  // hanging pliers and a ruler
  for (let i = 0; i < 12; i++) { put(d, 7 + (i >> 2), 9 + i, [96, 96, 102]); put(d, 11 - (i >> 2), 9 + i, [120, 120, 126]); }
  for (let y = 8; y < 28; y++) for (let x = 20; x < 24; x++) put(d, x, y, [226, 196, 110], x === 20 ? 1.1 : 0.95);
  for (let y = 9; y < 28; y += 3) put(d, 23, y, [80, 60, 30]);
}, { smooth: 0.22, bump: 1.6 });

function genFurnaceBody(d, rng) {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [132, 132, 134], quant(0.84 + f[k] * 0.26 + rng() * 0.05, 12)));
  bevelFrame(d, 0, 0, TM, TM, 1.18, 0.64);
  bevelFrame(d, 1, 1, TM - 1, TM - 1, 1.06, 0.84);
}
gen('furnace_side', (d, rng) => genFurnaceBody(d, rng), { smooth: 0.2, bump: 2.0 });
gen('furnace_top', (d, rng) => {
  genFurnaceBody(d, rng);
  for (const [x, y] of [[5, 5], [26, 5], [5, 26], [26, 26]]) { put(d, x, y, [180, 180, 184]); put(d, x + 1, y + 1, [70, 70, 72]); }
}, { smooth: 0.2, bump: 2.0 });
function genFurnaceFront(d, rng, ctx, lit) {
  genFurnaceBody(d, rng);
  for (let y = 16; y < 28; y++) for (let x = 7; x < 25; x++) {
    const edge = y === 16 || x === 7 || x === 24;
    if (edge) { put(d, x, y, [70, 70, 72]); continue; }
    if (!lit) { put(d, x, y, [26, 24, 24], 0.9 + rng() * 0.2); continue; }
    const h = (27 - y) / 11 + rng() * 0.25 - Math.abs(x - 15.5) * 0.03;
    const c = h > 0.9 ? [255, 236, 150] : h > 0.55 ? [255, 170, 40] : h > 0.25 ? [220, 80, 16] : [80, 24, 10];
    put(d, x, y, c);
    ctx.emit[y * TS + x] = clamp(h * 1.2, 0.2, 1);
  }
  for (let x = 8; x < 24; x += 3) put(d, x, 27, [60, 60, 64]);
  for (let x = 7; x < 25; x++) { put(d, x, 13, [96, 96, 98]); put(d, x, 12, [158, 158, 160]); }
}
gen('furnace_front', (d, rng, c) => genFurnaceFront(d, rng, c, false), { smooth: 0.2, bump: 2.0 });
gen('furnace_front_lit', (d, rng, c) => genFurnaceFront(d, rng, c, true), { smooth: 0.2, bump: 2.0 });

function genChest(d, rng, face) {
  genPlanks(d, rng, [158, 112, 60]);
  const band = [74, 50, 28];
  fillTile(d, (x, y) => {
    if (x < 2 || x > TM - 2 || y < 2 || y > TM - 2) put(d, x, y, band, x === 0 || y === 0 ? 1.2 : 0.9);
  });
  if (face === 'side' || face === 'front') for (let x = 0; x < TS; x++) { put(d, x, 10, band); put(d, x, 11, band, 0.8); }
  if (face === 'front') {
    for (let y = 7; y < 16; y++) for (let x = 13; x < 19; x++) put(d, x, y, [196, 196, 204], (x === 13 || y === 7) ? 1.15 : (x === 18 || y === 15) ? 0.7 : 1);
    put(d, 15, 12, [40, 40, 44]); put(d, 16, 12, [40, 40, 44]); put(d, 15, 13, [40, 40, 44]);
  }
}
gen('chest_top', (d, rng) => genChest(d, rng, 'top'), { smooth: 0.24, bump: 1.5 });
gen('chest_side', (d, rng) => genChest(d, rng, 'side'), { smooth: 0.24, bump: 1.5 });
gen('chest_front', (d, rng) => genChest(d, rng, 'front'), { smooth: 0.24, bump: 1.5 });

gen('torch', (d, rng, ctx) => {
  clearTile(d, [120, 90, 50]);
  for (let y = 16; y < TS; y++) for (let x = 14; x < 18; x++) put(d, x, y, [134, 98, 54], x === 14 ? 1.15 : x === 17 ? 0.72 : 0.95 + rng() * 0.06);
  const flame = [[255, 250, 214], [255, 214, 100], [250, 150, 40], [210, 90, 20]];
  for (let y = 12; y < 16; y++) for (let x = 14; x < 18; x++) {
    const k = y === 15 ? 3 : (x === 15 || x === 16) && y < 14 ? 0 : y < 14 ? 1 : 2;
    put(d, x, y, flame[k]);
    ctx.emit[y * TS + x] = 1;
  }
}, { smooth: 0.2, bump: 0.4 });

gen('ladder', (d, rng) => {
  clearTile(d, [140, 100, 60]);
  for (let y = 0; y < TS; y++) for (const x0 of [3, 25]) for (let x = x0; x < x0 + 4; x++) put(d, x, y, [140, 102, 60], x === x0 ? 1.1 : x === x0 + 3 ? 0.72 : 0.95);
  for (let r = 3; r < TS; r += 8) for (let x = 7; x < 25; x++) { put(d, x, r, [150, 110, 66], 1.1); put(d, x, r + 1, [150, 110, 66], 0.9); put(d, x, r + 2, [150, 110, 66], 0.7); }
}, { smooth: 0.2, bump: 1.4 });

// Doors: vertical boards in a darker frame; the upper half has a four-pane window.
function genDoor(d, rng, upper) {
  const base = [168, 128, 80];
  const grain = fbm(rng, 2, 3, 0.5, 16);
  clearTile(d, base);
  fillTile(d, (x, y, k) => {
    const board = x >> 3, bx = x & 7;
    let f = (0.9 + ((board * 37) % 7) * 0.02) * (0.9 + grain[k] * 0.2);
    if (bx === 7) f *= 0.7; else if (bx === 0) f *= 1.06;
    const frame = x < 3 || x > TM - 3 || (upper ? y < 3 : y > TM - 3);
    if (frame) f = (x === 0 || x === TM || y === 0 || y === TM ? 0.62 : 0.78) * (0.95 + rng() * 0.08);
    put(d, x, y, base, quant(f, 12));
  });
  if (upper) {
    // window: two by two panes with a mullion cross
    for (let y = 6; y < 22; y++) for (let x = 6; x < 26; x++) {
      if (x === 15 || x === 16 || y === 13 || y === 14) { put(d, x, y, [120, 86, 52], 0.9); continue; }
      if (x === 6 || y === 6 || x === 25 || y === 21) { put(d, x, y, [96, 68, 40]); continue; }
      const i = (y * TS + x) * 4;
      d[i] = 200; d[i + 1] = 228; d[i + 2] = 238; d[i + 3] = (x + y) % 9 === 0 ? 120 : 0;
    }
    for (let x = 6; x < 26; x++) put(d, x, 22, [70, 50, 30]);
  } else {
    // two raised panels and a handle
    for (const [y0, y1] of [[5, 13], [17, 27]]) for (let y = y0; y <= y1; y++) for (let x = 7; x <= 24; x++) {
      const edge = x === 7 || x === 24 || y === y0 || y === y1;
      if (edge) put(d, x, y, base, y === y0 || x === 7 ? 1.14 : 0.66);
    }
    put(d, 26, 15, [70, 70, 74]); put(d, 26, 16, [150, 150, 156]); put(d, 27, 16, [110, 110, 116]); put(d, 26, 17, [70, 70, 74]);
  }
}
gen('door_lower', (d, rng) => genDoor(d, rng, false), { smooth: 0.24, bump: 1.4 });
gen('door_upper', (d, rng) => genDoor(d, rng, true), { smooth: 0.24, bump: 1.4 });
gen('trapdoor', (d, rng) => {
  const base = [160, 122, 76];
  const grain = fbm(rng, 2, 3, 0.5, 16);
  clearTile(d, base);
  fillTile(d, (x, y, k) => {
    let f = 0.92 + grain[k] * 0.16;
    if ((x & 7) === 7) f *= 0.72;
    if (x < 2 || y < 2 || x > TM - 2 || y > TM - 2) f *= 0.72;
    put(d, x, y, base, quant(f, 12));
  });
  // four little square openings
  for (const [cx, cy] of [[9, 9], [22, 9], [9, 22], [22, 22]]) for (let y = cy - 3; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 2; x++) {
    const i = (y * TS + x) * 4;
    if (x === cx - 3 || y === cy - 3) { put(d, x, y, base, 0.55); continue; }
    d[i + 3] = 0;
  }
}, { smooth: 0.24, bump: 1.4 });

gen('bed_top', (d, rng) => {
  fillTile(d, (x, y) => {
    if (x < 2 || x > TM - 2) { put(d, x, y, [120, 84, 50], x === 0 || x === TM ? 0.8 : 1); return; }
    if (y < 11) { put(d, x, y, [232, 232, 238], (y === 1 || y === 10) ? 0.82 : 0.96 + rng() * 0.05); return; }
    let f = 0.92 + rng() * 0.06;
    if (y === 11) f = 0.7;
    if ((x + y) % 7 === 0) f *= 1.08;
    put(d, x, y, [176, 40, 44], f);
  });
}, { smooth: 0.1, bump: 0.8 });
gen('bed_side', (d, rng) => {
  fillTile(d, (x, y) => {
    if (y < 14) { put(d, x, y, [0, 0, 0], 1, 0); return; }
    if (y < 21) { put(d, x, y, x > 21 ? [232, 232, 238] : [176, 40, 44], y === 14 ? 1.12 : 0.94 + rng() * 0.04); return; }
    if (y < 26) { put(d, x, y, [132, 94, 56], y === 21 ? 1.1 : 0.94); return; }
    put(d, x, y, [100, 70, 40], (x < 4 || x > TM - 4) ? 1 : 0.55);
  });
}, { smooth: 0.1, bump: 0.8 });
gen('bed_end', (d, rng) => {
  fillTile(d, (x, y) => {
    if (y < 14) { put(d, x, y, [0, 0, 0], 1, 0); return; }
    if (y < 21) { put(d, x, y, [176, 40, 44], y === 14 ? 1.12 : 0.94 + rng() * 0.04); return; }
    if (y < 26) { put(d, x, y, [132, 94, 56], y === 21 ? 1.1 : 0.94); return; }
    put(d, x, y, [100, 70, 40], (x < 4 || x > TM - 4) ? 1 : 0.55);
  });
}, { smooth: 0.1, bump: 0.8 });

gen('farmland', (d, rng) => {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => {
    let fa = 0.8 + f[k] * 0.3 + rng() * 0.08;
    const ry = y & 7;
    if (ry === 0) fa *= 0.66; else if (ry === 1) fa *= 0.84; else if (ry === 4) fa *= 1.1;
    put(d, x, y, [96, 64, 40], quant(fa, 12));
  });
}, { smooth: 0.2, bump: 1.8 });

gen('bookshelf', (d, rng) => {
  genPlanks(d, rng, [170, 130, 80]);
  const pal = [[150, 40, 40], [50, 70, 150], [60, 120, 60], [140, 100, 50], [110, 50, 120], [190, 160, 100], [40, 110, 120]];
  for (const [y0, y1] of [[3, 14], [18, 29]]) {
    let x = 1;
    while (x < TS - 2) {
      const w = 2 + Math.floor(rng() * 3), h = y1 - y0 - Math.floor(rng() * 3);
      const c = pal[Math.floor(rng() * pal.length)];
      for (let xx = x; xx < Math.min(TS - 1, x + w); xx++) for (let y = y1 - h; y <= y1; y++) {
        let fa = xx === x ? 1.15 : xx === x + w - 1 ? 0.72 : 1;
        if (y === y1 - h + 2) fa *= 1.3;
        put(d, xx, y, c, fa);
      }
      x += w + (rng() < 0.2 ? 1 : 0);
    }
  }
}, { smooth: 0.2, bump: 1.6 });

gen('pumpkin_side', (d, rng) => {
  fillTile(d, (x, y) => {
    const rib = Math.cos((x / TS) * Math.PI * 2 * 4);
    let f = 0.86 + 0.14 * rib + rng() * 0.06;
    if (rib < -0.85) f *= 0.8;
    if (y < 2 || y > TM - 2) f *= 0.85;
    put(d, x, y, [218, 124, 26], quant(f, 12));
  });
}, { smooth: 0.35, bump: 1.4 });
gen('pumpkin_top', (d, rng) => {
  fillTile(d, (x, y) => {
    const a = Math.atan2(y - 15.5, x - 15.5), r = Math.hypot(x - 15.5, y - 15.5);
    let f = 0.88 + 0.12 * Math.cos(a * 8) + rng() * 0.05;
    if (r > 14) f *= 0.84;
    put(d, x, y, [214, 120, 24], quant(f, 12));
  });
  for (let y = 13; y < 19; y++) for (let x = 14; x < 18; x++) put(d, x, y, [96, 110, 40], x === 14 ? 1.2 : 1);
}, { smooth: 0.35, bump: 1.2 });
gen('jack_face', (d, rng, ctx) => {
  TEX_GEN.pumpkin_side(d, rng, ctx);
  const glow = (x, y) => { put(d, x, y, [255, 214, 90], 0.9 + rng() * 0.15); ctx.emit[y * TS + x] = 1; };
  for (let y = 0; y < 6; y++) for (let x = -y; x <= y; x++) { glow(9 + x, 7 + y); glow(22 + x, 7 + y); }
  for (let x = 6; x < 26; x++) {
    const top = 18 + ((x >> 2) & 1) * 2, bot = 25 - (((x + 2) >> 2) & 1) * 2;
    for (let y = top; y <= bot; y++) glow(x, y);
  }
}, { smooth: 0.35, bump: 1.4 });
gen('melon_side', (d, rng) => {
  fillTile(d, (x, y) => {
    const stripe = Math.sin((x + Math.sin(y * 0.4) * 1.5) * 0.8);
    put(d, x, y, stripe > 0.3 ? [150, 190, 60] : [90, 140, 36], quant(0.9 + rng() * 0.1, 10));
  });
}, { smooth: 0.4, bump: 1.0 });
gen('melon_top', (d, rng) => {
  fillTile(d, (x, y) => {
    const a = Math.atan2(y - 15.5, x - 15.5);
    put(d, x, y, Math.sin(a * 6) > 0.2 ? [140, 184, 58] : [96, 146, 40], quant(0.9 + rng() * 0.1, 10));
  });
  for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) put(d, x, y, [110, 90, 40]);
}, { smooth: 0.4, bump: 1.0 });

gen('tnt_side', (d, rng) => {
  fillTile(d, (x, y) => {
    const sx = x & 7;
    let f = sx === 0 ? 0.62 : sx === 1 ? 1.15 : sx === 7 ? 0.8 : 1;
    let c = [206, 52, 40];
    if (y >= 11 && y <= 20) {
      c = [236, 226, 206]; f = 0.95 + rng() * 0.05;
      if (y === 11 || y === 20) c = [40, 36, 36];
      else if (y >= 13 && y <= 18) { c = (((x + y) >> 1) & 1) ? [240, 200, 40] : [30, 30, 32]; }
    }
    put(d, x, y, c, f * (0.96 + rng() * 0.06));
  });
}, { smooth: 0.2, bump: 1.2 });
gen('tnt_top', (d, rng) => {
  fillTile(d, (x, y) => {
    const cx = (x & 15) - 7.5, cy = (y & 15) - 7.5, r = Math.hypot(cx, cy);
    put(d, x, y, r > 6.5 ? [150, 36, 30] : [206, 52, 40], r < 2 ? 0.7 : 1 - r * 0.02);
  });
  for (let y = 12; y < 20; y++) put(d, 15 + ((y >> 1) & 1), y, [60, 56, 50]);
}, { smooth: 0.2, bump: 1.2 });
gen('tnt_bottom', (d, rng) => {
  fillTile(d, (x, y) => {
    const cx = (x & 15) - 7.5, cy = (y & 15) - 7.5, r = Math.hypot(cx, cy);
    put(d, x, y, r > 6.5 ? [130, 30, 26] : [190, 48, 38], r < 2 ? 0.8 : 1 - r * 0.02);
  });
}, { smooth: 0.2, bump: 1.2 });

gen('hay_side', (d, rng) => {
  const f = fbm(rng, 16, 2, 0.5, 2);
  fillTile(d, (x, y, k) => {
    let c = [206, 172, 60], fa = 0.8 + f[k] * 0.34 + rng() * 0.06;
    if ((y >= 6 && y <= 8) || (y >= 23 && y <= 25)) { c = [150, 52, 30]; fa = y === 6 || y === 23 ? 1.1 : 0.9; }
    put(d, x, y, c, quant(fa, 12));
  });
}, { smooth: 0.15, bump: 1.4 });
gen('hay_top', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [196, 160, 56], 0.8 + rng() * 0.3));
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS), a = rng() * Math.PI;
    for (let j = 0; j < 4; j++) put(d, x + Math.round(Math.cos(a) * j), y + Math.round(Math.sin(a) * j), [228, 196, 90]);
  }
}, { smooth: 0.15, bump: 1.4 });

WOOL_COLORS.forEach(([, col], i) => {
  gen('wool_' + i, (d, rng) => {
    const f = fbm(rng, 8, 2);
    const dark = i === 15 ? 1.6 : i === 7 ? 1.25 : 1;
    fillTile(d, (x, y, k) => {
      const knit = ((x + (y >> 1)) & 3) === 0 ? 0.9 : ((x - (y >> 1)) & 3) === 2 ? 1.06 : 1;
      put(d, x, y, col, quant((0.86 + f[k] * 0.18 + rng() * 0.04) * knit * (dark > 1 ? 1 : 1), 16));
    });
    for (let k = 0; k < 50; k++) {
      const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
      put(d, x, y, col, 1.12 * dark); put(d, x + 1, y + 1, col, 0.84);
    }
  }, { smooth: 0.05, bump: 1.2 });
});

// --------------------------------------------------- landscape presets ----
function genSandLike(d, rng, base, specks) {
  const f = fbm(rng, 4, 2);
  const w = fbm(rng, 2, 2);
  fillTile(d, (x, y, k) => {
    const rip = 0.03 * Math.sin(y * 0.9 + x * 0.25 + w[k] * 9);
    put(d, x, y, base, quant(0.93 + f[k] * 0.1 + rip + rng() * 0.05, 24));
  });
  for (let i = 0; i < 110; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), specks[Math.floor(rng() * specks.length)]);
}
gen('white_sand', (d, rng) => genSandLike(d, rng, [236, 220, 178], [[218, 200, 160], [250, 240, 212], [240, 196, 184], [206, 188, 150]]), { smooth: 0.08, bump: 0.7 });
gen('red_sand', (d, rng) => genSandLike(d, rng, [198, 112, 58], [[176, 94, 46], [222, 140, 80], [160, 84, 44]]), { smooth: 0.06, bump: 0.8 });
gen('ash', (d, rng) => {
  genSandLike(d, rng, [92, 90, 94], [[70, 68, 72], [120, 118, 122], [56, 54, 58]]);
  for (let i = 0; i < 30; i++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), [140, 70, 50]);
}, { smooth: 0.05, bump: 1.2 });
gen('palm_side', (d, rng) => {
  const f = fbm(rng, 2, 2, 0.5, 8);
  fillTile(d, (x, y, k) => {
    const band = (y + ((x >> 3) & 1) * 2) % 6;
    let fa = 0.86 + f[k] * 0.2 + rng() * 0.05;
    if (band === 0) fa *= 0.62; else if (band === 1) fa *= 1.12;
    if (((x + y * 2) % 11) === 0) fa *= 0.85;
    put(d, x, y, [150, 118, 78], quant(fa, 12));
  });
}, { smooth: 0.1, bump: 2.0 });
gen('palm_top', (d, rng) => genRings(d, rng, [196, 166, 116], [160, 128, 84], [140, 108, 70]), { smooth: 0.1, bump: 1.4 });
gen('palm_leaves', (d, rng) => {
  clearTile(d, [96, 170, 60]);
  for (let s = 0; s < 5; s++) {
    const x0 = rng() * TS, a = -0.9 + rng() * 0.5;
    for (let i = 0; i < 44; i++) {
      const x = x0 + Math.cos(a) * i * 0.8, y = i * 0.75;
      put(d, Math.floor(x), Math.floor(y), [100, 176, 62], 0.75 + 0.3 * rng());
      for (const side of [-1, 1]) {
        if (i % 2) continue;
        const len = 2 + Math.floor(rng() * 3);
        for (let j = 1; j <= len; j++) put(d, Math.floor(x + side * j), Math.floor(y + j * 0.6), [108, 186, 70], 0.95 - j * 0.07 + rng() * 0.1);
      }
    }
  }
}, { smooth: 0.35, bump: 1.0 });
gen('basalt_side', (d, rng) => {
  const f = fbm(rng, 2, 3, 0.5, 8);
  fillTile(d, (x, y, k) => {
    const col = x % 8;
    let fa = 0.82 + f[k] * 0.3 + rng() * 0.05;
    if (col === 0) fa *= 0.62; else if (col === 1) fa *= 1.15;
    put(d, x, y, [64, 64, 70], quant(fa, 12));
  });
}, { smooth: 0.3, bump: 2.2 });
gen('basalt_top', (d, rng) => {
  const v = voronoi(rng, 9);
  stonesFromVoronoi(d, rng, v, () => [70, 70, 76], [36, 36, 40], 0.8, 0.25);
}, { smooth: 0.3, bump: 2.0 });
gen('magma', (d, rng, ctx) => {
  const v = voronoi(rng, 11);
  const f = fbm(rng, 4, 2);
  fillTile(d, (x, y, k) => {
    const e = v.edge[k];
    if (e < 1.3) {
      const t = 1 - e / 1.3;
      put(d, x, y, mixc([200, 60, 10], [255, 190, 60], t * 0.8 + rng() * 0.2));
      ctx.emit[k] = 0.5 + 0.5 * t;
    } else put(d, x, y, [70, 28, 22], quant(0.8 + f[k] * 0.35 + rng() * 0.05, 10));
  });
}, { smooth: 0.4, bump: 1.8 });
CORAL_COLORS.forEach(([, col], i) => {
  gen('coral_' + i, (d, rng) => {
    const f = fbm(rng, 4, 3);
    fillTile(d, (x, y, k) => put(d, x, y, col, quant(0.82 + f[k] * 0.3 + rng() * 0.06, 12)));
    for (let n = 0; n < 34; n++) {
      const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
      put(d, x, y, col, 0.5); put(d, x + 1, y, col, 0.66); put(d, x, y - 1, col, 1.2);
    }
  }, { smooth: 0.25, bump: 2.0 });
});
TERRACOTTA_COLORS.forEach(([, col], i) => {
  gen('terracotta_' + i, (d, rng) => {
    const f = fbm(rng, 3, 3);
    fillTile(d, (x, y, k) => put(d, x, y, col, quant(0.9 + f[k] * 0.14 + rng() * 0.04, 20)));
    for (let n = 0; n < 24; n++) put(d, Math.floor(rng() * TS), Math.floor(rng() * TS), col, 0.85);
  }, { smooth: 0.2, bump: 0.8 });
});

// ------------------------------------------------------------- effects ----
gen('crack', (d, rng) => {
  clearTile(d, [30, 30, 30]);
  const stage = new Float32Array(TSS).fill(99);
  const walk = (x, y, a, len, s0) => {
    for (let i = 0; i < len; i++) {
      const xi = Math.round(x) & TM, yi = Math.round(y) & TM;
      const s = s0 + i * 0.35;
      if (s < stage[yi * TS + xi]) stage[yi * TS + xi] = s;
      x += Math.cos(a); y += Math.sin(a); a += (rng() - 0.5) * 0.8;
      if (rng() < 0.08 && len > 5) walk(x, y, a + (rng() < 0.5 ? 1 : -1), len * 0.5, s);
    }
  };
  for (let k = 0; k < 7; k++) walk(15.5, 15.5, (k / 7) * Math.PI * 2 + rng() * 0.5, 16 + rng() * 6, k * 0.3);
  for (let k = 0; k < 8; k++) walk(rng() * TS, rng() * TS, rng() * 6.28, 6 + rng() * 6, 4 + rng() * 4);
  fillTile(d, (x, y, k) => {
    if (stage[k] > 9.5) return;
    put(d, x, y, [26, 24, 22], 0.8 + rng() * 0.4, Math.round((Math.floor(stage[k]) + 1) * 25));
  });
}, { soft: true, bump: 0 });
gen('p_smoke', (d, rng) => {
  fillTile(d, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 15;
    const n = 0.85 + rng() * 0.15;
    put(d, x, y, [236, 236, 236], n, Math.round(clamp(1 - r, 0, 1) ** 1.4 * 255 * n));
  });
}, { soft: true, bump: 0 });
gen('p_flame', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const dx = (x + 0.5 - 16) / 9, dy = (y + 0.5 - 18) / 13;
    const r = Math.sqrt(dx * dx + dy * dy * (dy < 0 ? 0.6 : 1.4));
    if (r > 1) { put(d, x, y, [255, 140, 30], 1, 0); return; }
    put(d, x, y, mixc([255, 250, 200], [255, 120, 20], r), 1, 255);
    ctx.emit[k] = 1;
  });
}, { bump: 0 });
gen('p_crit', (d) => {
  clearTile(d, [255, 255, 255]);
  fillTile(d, (x, y) => {
    const dx = Math.abs(x + 0.5 - 16), dy = Math.abs(y + 0.5 - 16);
    if (dx * dy < 6 && dx + dy < 14) put(d, x, y, [255, 255, 255]);
  });
}, { bump: 0 });
gen('p_bubble', (d) => {
  clearTile(d, [200, 230, 255]);
  fillTile(d, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (r < 10 && r > 7.5) put(d, x, y, [210, 236, 255]);
    else if (r <= 7.5 && x < 13 && y < 13 && r > 4) put(d, x, y, [255, 255, 255]);
  });
}, { bump: 0 });

// --------------------------------------------------------- item sprites ----
// A tiny vector rasteriser: shapes are sampled at pixel centres, then sprFinish adds pixel-art
// shading (lit top-left rims, dark bottom-right) and a dark outline.
function colAt(c, x, y) { return typeof c === 'function' ? c(x, y) : c; }
function sprDisc(d, cx, cy, r, c) {
  fillTile(d, (x, y) => { if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(d, x, y, colAt(c, x, y)); });
}
function sprEllipse(d, cx, cy, rx, ry, ang, c, clip) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  fillTile(d, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
    if (u * u + v * v <= 1 && (!clip || clip(x, y))) put(d, x, y, colAt(c, x, y));
  });
}
function sprSeg(d, x0, y0, x1, y1, w, c) {
  const vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy || 1;
  fillTile(d, (x, y) => {
    const px = x + 0.5 - x0, py = y + 0.5 - y0;
    const t = clamp((px * vx + py * vy) / l2, 0, 1);
    const dx = px - vx * t, dy = py - vy * t;
    if (dx * dx + dy * dy <= (w / 2) * (w / 2)) put(d, x, y, colAt(c, x, y));
  });
}
function sprPoly(d, pts, c) {
  fillTile(d, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) put(d, x, y, colAt(c, x, y));
  });
}
function sprRect(d, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(d, x, y, colAt(c, x, y)); }
function sprFinish(d, outline = true) {
  const src = d.slice();
  const a = (x, y) => (x < 0 || y < 0 || x > TM || y > TM ? 0 : src[((y * TS + x) << 2) + 3]);
  fillTile(d, (x, y, k) => {
    const i = k << 2;
    if (src[i + 3]) {
      let f = 1;
      if (!a(x, y - 1) || !a(x - 1, y)) f = 1.18;
      else if (!a(x, y + 1) || !a(x + 1, y)) f = 0.76;
      d[i] = src[i] * f; d[i + 1] = src[i + 1] * f; d[i + 2] = src[i + 2] * f;
      return;
    }
    if (!outline) return;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!a(x + ox, y + oy)) continue;
      const j = (((y + oy) * TS) + (x + ox)) << 2;
      d[i] = src[j] * 0.3; d[i + 1] = src[j + 1] * 0.3; d[i + 2] = src[j + 2] * 0.3; d[i + 3] = 255;
      return;
    }
  });
}
function noisy(c, rng, amt = 0.1) { return () => shadec(c, 1 - amt / 2 + rng() * amt); }
function sprite(name, fn) {
  gen(name, (d, rng, ctx) => { clearTile(d, [128, 128, 128]); fn(d, rng, ctx); sprFinish(d, true); }, { bump: 0, smooth: 0.2 });
}

const WOOD_C = [132, 94, 52];
// handle runs from bottom-left to top-right; H is where the head sits
const TOOL_U = [0.7071, -0.7071], TOOL_N = [0.7071, 0.7071];
function toolPt(hx, hy, s, t) { return [hx + TOOL_U[0] * s + TOOL_N[0] * t, hy + TOOL_U[1] * s + TOOL_N[1] * t]; }
function drawTool(d, rng, kind, mat) {
  const head = mat.key === 'stone' ? noisy(mat.head, rng, 0.2) : mat.head;
  const hi = shadec(mat.head, mat.key === 'gold' ? 1.1 : 1.2);
  if (kind === 'sword') {
    const G = [11, 21];
    const tip = toolPt(G[0], G[1], 21.5, 0);
    sprPoly(d, [toolPt(G[0], G[1], 0, -2.3), toolPt(G[0], G[1], 17, -2.3), tip, toolPt(G[0], G[1], 17, 2.3), toolPt(G[0], G[1], 0, 2.3)], head);
    sprSeg(d, ...toolPt(G[0], G[1], 1, 0), ...toolPt(G[0], G[1], 18, 0), 1, hi);
    sprSeg(d, ...toolPt(G[0], G[1], 0, -5), ...toolPt(G[0], G[1], 0, 5), 2.4, mat.key === 'wood' ? [96, 66, 36] : [70, 60, 50]);
    sprSeg(d, ...toolPt(G[0], G[1], -1, 0), ...toolPt(G[0], G[1], -6, 0), 2.2, [90, 62, 34]);
    sprDisc(d, ...toolPt(G[0], G[1], -7, 0), 1.7, mat.key === 'wood' ? [110, 78, 42] : mat.head);
    return;
  }
  sprSeg(d, 6, 27, 20.5, 12.5, 2.6, WOOD_C);
  const H = [21, 11];
  if (kind === 'pickaxe') {
    let prev = null;
    for (let t = -11; t <= 11; t += 0.5) {
      const p = toolPt(H[0], H[1], -0.034 * t * t, t);
      if (prev) sprSeg(d, prev[0], prev[1], p[0], p[1], 3.6 * (1 - 0.45 * (Math.abs(t) / 11) ** 2), head);
      prev = p;
    }
    sprSeg(d, ...toolPt(H[0], H[1], 0.9, -8), ...toolPt(H[0], H[1], 0.9, 8), 1, hi);
  } else if (kind === 'axe') {
    const P = (s, t) => toolPt(H[0], H[1], s, t);
    sprPoly(d, [P(-4.5, 0.8), P(3.5, 0.8), P(5, -4), P(3.6, -9.5), P(-4.8, -9.5), P(-6, -4)], head);
    sprSeg(d, ...P(3.2, -9), ...P(-4.4, -9), 1.2, hi);
  } else if (kind === 'shovel') {
    const c = toolPt(H[0], H[1], 2.5, 0);
    sprEllipse(d, c[0], c[1], 6, 4.4, -Math.PI / 4, head);
    sprSeg(d, ...toolPt(H[0], H[1], 0, 0), ...toolPt(H[0], H[1], 6, -1.5), 1, hi);
  } else if (kind === 'hoe') {
    sprSeg(d, ...toolPt(H[0], H[1], 0, 1.5), ...toolPt(H[0], H[1], 0, -7), 3, head);
    sprSeg(d, ...toolPt(H[0], H[1], 0, -7), ...toolPt(H[0], H[1], -3, -7.5), 2.8, head);
  }
}
TOOL_MATS.forEach((m) => TOOL_KINDS.forEach((k) => sprite('t_' + m.key + '_' + k.key, (d, rng) => drawTool(d, rng, k.key, m))));

function drawArmor(d, rng, slot, m) {
  const c = m.key === 'leather' ? noisy(m.color, rng, 0.14) : m.color;
  const trim = shadec(m.color, 1.25);
  if (slot === 'helmet') {
    sprEllipse(d, 16, 16, 11, 9, 0, c, (x, y) => y < 16);
    sprRect(d, 5, 15, 27, 23, c);
    sprRect(d, 10, 17, 22, 24, [0, 0, 0]);
    fillTile(d, (x, y) => { if (x >= 10 && x < 22 && y >= 17 && y < 24) put(d, x, y, [0, 0, 0], 1, 0); });
    sprRect(d, 6, 14, 26, 15, trim);
  } else if (slot === 'chest') {
    sprPoly(d, [[7, 5], [12, 5], [14, 8], [18, 8], [20, 5], [25, 5], [29, 10], [26, 15], [23, 13], [23, 28], [9, 28], [9, 13], [6, 15], [3, 10]], c);
    sprSeg(d, 16, 10, 16, 27, 1, shadec(m.color, 0.8));
    sprSeg(d, 13, 8.5, 19, 8.5, 1, trim);
  } else if (slot === 'legs') {
    sprPoly(d, [[8, 5], [24, 5], [24, 28], [18, 28], [17, 13], [15, 13], [14, 28], [8, 28]], c);
    sprRect(d, 8, 5, 24, 8, trim);
  } else {
    sprPoly(d, [[6, 13], [13, 13], [13, 27], [3, 27], [3, 22], [6, 22]], c);
    sprPoly(d, [[19, 13], [26, 13], [26, 22], [29, 22], [29, 27], [19, 27]], c);
    sprRect(d, 6, 13, 13, 15, trim); sprRect(d, 19, 13, 26, 15, trim);
  }
}
ARMOR_MATS.forEach((m) => ARMOR_SLOTS.forEach((s) => sprite('a_' + m.key + '_' + s.key, (d, rng) => drawArmor(d, rng, s.key, m))));

sprite('i_stick', (d) => { sprSeg(d, 8, 25, 24, 7, 2.4, [136, 98, 56]); sprSeg(d, 13, 19, 14, 18, 1, [96, 66, 36]); });
const lump = [[9, 12], [15, 7], [23, 9], [26, 17], [21, 25], [12, 26], [7, 19]];
sprite('i_coal', (d, rng) => { sprPoly(d, lump, noisy([46, 46, 50], rng, 0.2)); sprPoly(d, [[11, 12], [16, 9], [18, 14], [13, 16]], [86, 86, 92]); sprPoly(d, [[19, 17], [23, 15], [22, 21]], [70, 70, 76]); });
sprite('i_charcoal', (d, rng) => { sprPoly(d, lump, noisy([54, 42, 34], rng, 0.2)); sprPoly(d, [[11, 12], [16, 9], [18, 14], [13, 16]], [92, 74, 60]); });
function ingot(d, c) {
  sprPoly(d, [[5, 16], [19, 9], [27, 13], [13, 20]], shadec(c, 1.15));
  sprPoly(d, [[5, 16], [13, 20], [13, 25], [5, 21]], shadec(c, 0.92));
  sprPoly(d, [[13, 20], [27, 13], [27, 18], [13, 25]], shadec(c, 0.72));
}
sprite('i_iron_ingot', (d) => ingot(d, [214, 214, 210]));
sprite('i_gold_ingot', (d) => ingot(d, [250, 206, 60]));
sprite('i_diamond', (d) => {
  sprPoly(d, [[16, 4], [27, 12], [16, 28], [5, 12]], [92, 226, 216]);
  sprPoly(d, [[16, 4], [27, 12], [5, 12]], [170, 250, 244]);
  sprPoly(d, [[11, 12], [16, 4], [21, 12], [16, 22]], [210, 255, 252]);
  sprSeg(d, 5, 12, 27, 12, 1, [60, 170, 170]);
});
sprite('i_flint', (d) => { sprPoly(d, [[12, 5], [22, 9], [25, 19], [17, 27], [8, 20]], [60, 60, 64]); sprPoly(d, [[13, 8], [20, 11], [15, 16]], [106, 106, 112]); });
sprite('i_string', (d) => { let p = null; for (let t = 0; t <= 1.001; t += 0.02) { const q = [6 + 20 * t, 16 + 7 * Math.sin(t * Math.PI * 2.6)]; if (p) sprSeg(d, p[0], p[1], q[0], q[1], 1.4, [236, 236, 236]); p = q; } });
sprite('i_feather', (d) => { sprEllipse(d, 17, 14, 4, 11.5, Math.PI / 4.2, [232, 232, 236]); sprSeg(d, 8, 26, 24, 5, 1.2, [170, 170, 176]); });
sprite('i_bone', (d) => {
  sprSeg(d, 10, 22, 22, 10, 3.6, [236, 232, 214]);
  for (const [x, y] of [[8, 21], [11, 25], [21, 7], [25, 11]]) sprDisc(d, x, y, 2.6, [236, 232, 214]);
});
sprite('i_gunpowder', (d, rng) => { sprEllipse(d, 16, 21, 11, 6.5, 0, noisy([82, 82, 84], rng, 0.4)); sprEllipse(d, 16, 16, 6, 4.5, 0, noisy([96, 96, 98], rng, 0.4)); });
sprite('i_leather', (d, rng) => { sprPoly(d, [[8, 6], [16, 8], [24, 5], [26, 14], [24, 26], [16, 23], [7, 26], [6, 15]], noisy([158, 94, 52], rng, 0.12)); });
sprite('i_wheat', (d) => {
  for (let i = 0; i < 5; i++) {
    const tx = 8 + i * 4, ty = 5 + (i % 2) * 2;
    sprSeg(d, 16, 28, tx, ty + 6, 1.2, [196, 164, 64]);
    sprEllipse(d, tx, ty + 3, 1.8, 4.2, (tx - 16) * 0.04, [226, 190, 80]);
  }
  sprSeg(d, 13, 21, 19, 21, 1.6, [150, 100, 40]);
});
sprite('i_seeds', (d) => { for (const [x, y, c] of [[10, 12, 0], [17, 9, 1], [22, 15, 0], [13, 19, 1], [19, 22, 0], [9, 24, 1]]) sprEllipse(d, x, y, 2.2, 1.5, 0.6, c ? [120, 150, 60] : [170, 160, 96]); });
sprite('i_paper', (d) => { sprPoly(d, [[8, 6], [24, 5], [25, 26], [9, 27]], [238, 236, 226]); for (let y = 10; y < 24; y += 4) sprSeg(d, 11, y, 22, y - 0.5, 0.8, [200, 200, 196]); });
sprite('i_book', (d) => { sprRect(d, 7, 6, 25, 27, [128, 62, 40]); sprRect(d, 22, 7, 25, 26, [238, 232, 216]); sprRect(d, 7, 6, 10, 27, [96, 44, 30]); sprRect(d, 12, 11, 20, 15, [220, 196, 120]); });
sprite('i_bowl', (d) => { sprEllipse(d, 16, 15, 11.5, 10, 0, [140, 98, 56], (x, y) => y >= 15); sprRect(d, 5, 14, 28, 16, [170, 124, 74]); });
sprite('i_arrow', (d) => {
  sprSeg(d, 8, 24, 23, 9, 1.5, [140, 100, 56]);
  sprPoly(d, [[27, 5], [20, 8], [24, 12]], [190, 190, 196]);
  sprPoly(d, [[5, 23], [9, 24], [8, 28], [4, 27]], [236, 236, 236]);
  sprPoly(d, [[8, 20], [12, 24], [9, 25], [6, 22]], [220, 60, 50]);
});
sprite('i_bow', (d) => {
  let p = null;
  for (let t = 0; t <= 1.001; t += 0.04) {
    const q = [(1 - t) ** 2 * 7 + 2 * (1 - t) * t * 29 + t * t * 26, (1 - t) ** 2 * 6 + 2 * (1 - t) * t * 3 + t * t * 26];
    if (p) sprSeg(d, p[0], p[1], q[0], q[1], 2.6, [136, 96, 52]);
    p = q;
  }
  sprSeg(d, 7, 6, 26, 26, 0.9, [230, 230, 230]);
  sprSeg(d, 19, 7, 23, 11, 2.8, [80, 56, 30]);
});
sprite('i_flint_steel', (d) => {
  let p = null;
  for (let a = 0.6; a <= 5.4; a += 0.2) { const q = [12 + Math.cos(a) * 6, 16 + Math.sin(a) * 8]; if (p) sprSeg(d, p[0], p[1], q[0], q[1], 2.6, [170, 170, 176]); p = q; }
  sprPoly(d, [[19, 12], [26, 14], [25, 22], [18, 21]], [70, 70, 74]);
});
function bucket(d, inner) {
  let p = null;
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.2) { const q = [16 + Math.cos(a) * 9, 11 + Math.sin(a) * 8]; if (p) sprSeg(d, p[0], p[1], q[0], q[1], 1.3, [150, 150, 156]); p = q; }
  sprPoly(d, [[7, 11], [25, 11], [23, 28], [9, 28]], [184, 184, 190]);
  sprEllipse(d, 16, 11, 9, 2.8, 0, [210, 210, 216]);
  sprEllipse(d, 16, 11.3, 7, 1.8, 0, inner || [70, 70, 76]);
}
sprite('i_bucket', (d) => bucket(d, null));
sprite('i_water_bucket', (d) => bucket(d, [50, 100, 220]));
sprite('i_lava_bucket', (d) => bucket(d, [250, 130, 20]));
function apple(d, c) {
  sprDisc(d, 12.5, 18, 8, c); sprDisc(d, 19.5, 18, 8, c); sprDisc(d, 16, 21, 8.5, c);
  sprSeg(d, 16, 11, 17.5, 5, 1.6, [96, 64, 30]);
  sprEllipse(d, 21, 7, 3.4, 1.8, -0.5, [70, 150, 50]);
  sprDisc(d, 11.5, 15.5, 2, shadec(c, 1.4));
}
sprite('i_apple', (d) => apple(d, [204, 32, 34]));
sprite('i_golden_apple', (d) => apple(d, [250, 206, 60]));
sprite('i_bread', (d) => {
  sprEllipse(d, 16, 18, 12.5, 7, -0.2, [206, 146, 64]);
  for (const x of [10, 15, 20]) sprSeg(d, x - 1.5, 14.5, x + 1.5, 20.5, 1.2, [234, 196, 120]);
});
function chop(d, c, fat, bone) {
  sprPoly(d, [[6, 14], [12, 7], [22, 7], [27, 13], [25, 22], [16, 26], [8, 23]], c);
  if (fat) { sprSeg(d, 7, 14, 12, 8, 1.8, fat); sprSeg(d, 12, 8, 21, 8, 1.8, fat); }
  if (bone) { sprSeg(d, 20, 18, 27, 25, 2.4, [236, 230, 212]); sprDisc(d, 27, 26, 2, [236, 230, 212]); }
}
sprite('i_raw_pork', (d) => chop(d, [228, 136, 132], [248, 214, 206], true));
sprite('i_cooked_pork', (d) => { chop(d, [178, 104, 62], [214, 170, 110], true); sprSeg(d, 10, 18, 20, 12, 1, [120, 64, 30]); });
sprite('i_raw_beef', (d) => { chop(d, [196, 50, 52], null, false); for (const [a, b, c2, e] of [[9, 16, 17, 12], [12, 21, 22, 15]]) sprSeg(d, a, b, c2, e, 1, [240, 200, 196]); });
sprite('i_steak', (d) => { chop(d, [138, 78, 42], null, false); for (let i = 0; i < 3; i++) sprSeg(d, 9 + i * 5, 20, 14 + i * 5, 11, 1, [86, 44, 20]); });
function drumstick(d, c) { sprSeg(d, 16, 17, 25, 26, 2.8, [236, 230, 212]); sprDisc(d, 26, 26, 2.2, [236, 230, 212]); sprEllipse(d, 12, 13, 8, 6, 0.8, c); }
sprite('i_raw_chicken', (d) => drumstick(d, [236, 186, 170]));
sprite('i_cooked_chicken', (d) => drumstick(d, [196, 128, 64]));
sprite('i_raw_mutton', (d) => { sprEllipse(d, 16, 16, 11, 8, -0.4, [206, 70, 70]); sprEllipse(d, 16, 16, 11, 8, -0.4, [236, 210, 200], (x, y) => y > 20); });
sprite('i_cooked_mutton', (d) => { sprEllipse(d, 16, 16, 11, 8, -0.4, [150, 86, 50]); sprEllipse(d, 16, 16, 11, 8, -0.4, [200, 160, 110], (x, y) => y > 20); });
sprite('i_rotten_flesh', (d, rng) => { sprPoly(d, [[7, 10], [15, 6], [25, 9], [26, 19], [19, 26], [9, 24]], noisy([126, 104, 66], rng, 0.3)); for (const [x, y] of [[12, 12], [20, 16], [15, 21]]) sprDisc(d, x, y, 1.6, [90, 110, 50]); });
sprite('i_stew', (d) => { sprEllipse(d, 16, 15, 11.5, 10, 0, [140, 98, 56], (x, y) => y >= 15); sprEllipse(d, 16, 15, 10, 3, 0, [170, 110, 70]); sprDisc(d, 12, 15, 1.5, [220, 60, 50]); sprDisc(d, 19, 14.5, 1.5, [210, 180, 150]); });
sprite('i_bone_meal', (d, rng) => { sprEllipse(d, 16, 21, 10, 6, 0, noisy([236, 236, 230], rng, 0.1)); sprEllipse(d, 16, 16, 5, 4, 0, [246, 246, 242]); });
sprite('i_shears', (d) => {
  sprSeg(d, 9, 23, 24, 8, 2.4, [200, 200, 206]); sprSeg(d, 9, 9, 24, 24, 2.4, [180, 180, 186]);
  sprDisc(d, 7, 25, 3, [180, 50, 40]); sprDisc(d, 7, 7, 3, [180, 50, 40]);
});
sprite('i_melon_slice', (d) => {
  sprEllipse(d, 16, 10, 13, 16, 0, [214, 50, 50], (x, y) => y >= 10);
  sprEllipse(d, 16, 10, 13, 16, 0, [90, 150, 40], (x, y) => y >= 10 && ((x + 0.5 - 16) / 13) ** 2 + ((y + 0.5 - 10) / 16) ** 2 > 0.72);
  for (const [x, y] of [[12, 15], [18, 14], [15, 19], [20, 19]]) put(d, x, y, [30, 20, 20]);
});
sprite('i_door', (d) => {
  sprRect(d, 9, 3, 23, 29, [150, 112, 68]);
  sprRect(d, 9, 3, 23, 5, [118, 86, 50]);
  sprRect(d, 11, 6, 21, 14, [196, 226, 236]);
  sprRect(d, 15, 6, 17, 14, [118, 86, 50]); sprRect(d, 11, 9, 21, 11, [118, 86, 50]);
  sprRect(d, 11, 17, 21, 26, [134, 98, 58]);
  sprRect(d, 19, 18, 20, 20, [60, 60, 64]);
});
// top view of a twin-tail fighter jet
sprite('i_jet', (d) => {
  const hull = (x, y) => shadec([150, 160, 172], 0.92 + ((x * 7 + y * 3) % 5) * 0.03);
  sprPoly(d, [[16, 1], [18, 7], [18.5, 12], [29, 21], [29, 23.5], [19, 22], [19, 25], [23, 29], [23, 30.5], [9, 30.5], [9, 29], [13, 25], [13, 22], [3, 23.5], [3, 21], [13.5, 12], [14, 7]], hull);
  sprPoly(d, [[16, 4.5], [17.3, 8.5], [17.3, 12], [14.7, 12], [14.7, 8.5]], [40, 70, 96]);
  sprSeg(d, 16, 13, 16, 29, 0.8, [112, 120, 130]);
  sprDisc(d, 8, 21.3, 1.8, [40, 70, 170]); sprDisc(d, 8, 21.3, 0.9, [210, 50, 40]);
  sprDisc(d, 24, 21.3, 1.8, [40, 70, 170]); sprDisc(d, 24, 21.3, 0.9, [210, 50, 40]);
  sprRect(d, 14, 29, 15, 31, [255, 150, 60]); sprRect(d, 17, 29, 18, 31, [255, 150, 60]);
});

// ------------------------------------------------------------ pipeline ----
const TEX_SMOOTH_DEFAULT = 0.1, TEX_BUMP_DEFAULT = 1.4;

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
function hasCutout(d) { for (let i = 3; i < d.length; i += 4) if (d[i] < 128) return true; return false; }

// Mip chain; cutout layers keep their alpha-test coverage at every level.
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
  const h = new Float32Array(TSS);
  for (let i = 0; i < TSS; i++) {
    const a = tile[i * 4 + 3];
    h[i] = a > 127 ? (0.299 * tile[i * 4] + 0.587 * tile[i * 4 + 1] + 0.114 * tile[i * 4 + 2]) / 255 : 0.5;
  }
  const out = new Uint8ClampedArray(TSS * 4);
  const bs = bump * 0.75;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = h[y * TS + ((x + 1) & TM)] - h[y * TS + ((x + TM) & TM)];
    const dy = h[((y + 1) & TM) * TS + x] - h[((y + TM) & TM) * TS + x];
    let nx = -dx * bs, ny = -dy * bs, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const i = (y * TS + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255;
    out[i + 3] = smooth[y * TS + x] * 255;
  }
  return out;
}

// Paints every registered layer. Returns albedo mips, normal/smoothness, emission and tiles.
function generateTextures(seed) {
  const count = TEX_NAMES.length;
  const tiles = [], normals = [], mipsPerLayer = [], emits = [];
  for (let t = 0; t < count; t++) {
    const name = TEX_NAMES[t];
    const opt = TEX_OPT[name] || {};
    const rng = mulberry32((seed * 7919 + t * 104729 + name.length * 31) | 0);
    const d = newTile();
    const ctx = { smooth: new Float32Array(TSS).fill(opt.smooth !== undefined ? opt.smooth : TEX_SMOOTH_DEFAULT), emit: new Float32Array(TSS) };
    const g = TEX_GEN[name];
    if (g) g(d, rng, ctx);
    else fillTile(d, (x, y) => put(d, x, y, ((x >> 2) + (y >> 2)) & 1 ? [255, 0, 255] : [0, 0, 0]));
    const cut = !opt.soft && hasCutout(d);
    if (cut) bleedTransparent(d);
    tiles.push(d);
    normals.push(buildNormalMap(d, ctx.smooth, opt.bump !== undefined ? opt.bump : TEX_BUMP_DEFAULT));
    mipsPerLayer.push(buildMips(d, cut));
    const e = new Uint8Array(TSS);
    for (let i = 0; i < TSS; i++) e[i] = clamp(ctx.emit[i], 0, 1) * 255;
    emits.push(e);
  }
  const levels = [];
  for (let l = 0, size = TS; size >= 1; l++, size >>= 1) {
    const buf = new Uint8Array(size * size * 4 * count);
    for (let t = 0; t < count; t++) buf.set(mipsPerLayer[t][l], t * size * size * 4);
    levels.push({ size, data: buf });
  }
  const normalBuf = new Uint8Array(TSS * 4 * count);
  for (let t = 0; t < count; t++) normalBuf.set(normals[t], t * TSS * 4);
  const emitBuf = new Uint8Array(TSS * count);
  for (let t = 0; t < count; t++) emitBuf.set(emits[t], t * TSS);
  return { tiles, levels, normal: normalBuf, emit: emitBuf, count };
}

// ------------------------------------------------------------- UI icons ----
const tileCanvasCache = new Map();
function tileCanvas(tiles, layer) {
  let c = tileCanvasCache.get(layer);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = TS;
  const src = tiles[layer];
  const img = new ImageData(new Uint8ClampedArray(src), TS, TS);
  c.getContext('2d').putImageData(img, 0, 0);
  tileCanvasCache.set(layer, c);
  return c;
}

// Faces of a shaped / connecting block as seen in its icon: [{ p: [[x,y,z]...] (0..1), n, uv, layer }].
function shapeIconFaces(bid) {
  const faces = [];
  const tex = (d) => BLOCK_TEX[bid * 6 + d];
  const addBox = (b) => {
    const [x0, y0, z0, x1, y1, z1] = b.map((v) => v / 16);
    for (let d = 0; d < 6; d++) {
      const p = FACE_CORNERS[d].map((c) => [c[0] ? x1 : x0, c[1] ? y1 : y0, c[2] ? z1 : z0]);
      faces.push({ p, n: DIRS[d], uv: p.map((q) => [faceU(d, q[0], q[1], q[2]), faceV(d, q[0], q[1], q[2])]), layer: tex(d) });
    }
  };
  if (BLOCK_RT[bid] === RT_CONNECT) {
    for (const b of connectBoxes(BLOCK_CONNECT[bid], true, true, false, false, false)) addBox(b);
    return faces;
  }
  const k = BLOCK_SHAPE[bid];
  if (k === SH_PILLAR) { for (const b of pillarBoxes(false, false)) addBox(b); return faces; }
  const g = shapeGeom(k, k === SH_OUTER || k === SH_INNER ? 0 : 5);
  for (const b of g.boxes) addBox(b);
  for (const q of g.polys) {
    const p = q.p.map((v) => [v[0] / 16, v[1] / 16, v[2] / 16]);
    const d = q.n[0] > 0 ? 0 : q.n[0] < 0 ? 1 : q.n[1] > 0 ? 2 : q.n[1] < 0 ? 3 : q.n[2] > 0 ? 4 : 5;
    const uv = q.uv || p.map((v) => [faceU(d, v[0], v[1], v[2]), faceV(d, v[0], v[1], v[2])]);
    faces.push({ p, n: q.n, uv, layer: q.slant ? tex(2) : tex(d), slant: q.slant });
  }
  return faces;
}

// Isometric drawing of arbitrary textured faces (same projection as the cube icons): back-facing
// faces are dropped, the rest painted far to near, each texture mapped with an affine transform
// and clipped to its polygon.
function drawIsoShape(ctx, tiles, bid, size) {
  const s = size / 48;
  const P = (q) => [(3 + 21 * (q[0] + q[2])) * s, (13 + 11 * (q[2] - q[0]) + 22 * (1 - q[1])) * s];
  const faces = shapeIconFaces(bid).filter((f) => -f.n[0] + f.n[1] + f.n[2] > 0.01);
  faces.forEach((f) => { f.depth = f.p.reduce((a, q) => a - q[0] + q[1] + q[2], 0) / f.p.length; });
  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) {
    const S = f.p.map(P), T = f.uv.map((t) => [t[0] * TS, t[1] * TS]);
    const du1 = T[1][0] - T[0][0], dv1 = T[1][1] - T[0][1], du2 = T[2][0] - T[0][0], dv2 = T[2][1] - T[0][1];
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-6) continue;
    const dx1 = S[1][0] - S[0][0], dy1 = S[1][1] - S[0][1], dx2 = S[2][0] - S[0][0], dy2 = S[2][1] - S[0][1];
    const a = (dx1 * dv2 - dx2 * dv1) / det, c = (dx2 * du1 - dx1 * du2) / det;
    const b = (dy1 * dv2 - dy2 * dv1) / det, d = (dy2 * du1 - dy1 * du2) / det;
    const e = S[0][0] - a * T[0][0] - c * T[0][1], g = S[0][1] - b * T[0][0] - d * T[0][1];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    S.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, g);
    ctx.drawImage(tileCanvas(tiles, f.layer), 0, 0);
    const shade = f.slant ? (f.n[0] < 0 ? 0.2 : 0.08) : f.n[1] > 0.9 ? 0 : f.n[0] < 0 ? 0.26 : 0.44;
    if (shade > 0) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, TS, TS); }
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Isometric block icon or flat sprite for the UI; returns a canvas of size x size.
function makeItemIcon(tiles, id, size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const def = ITEM_DEF[id];
  if (!def) return cv;
  if (!def.block || def.render === 'sprite') {
    const m = Math.round(size * 0.06);
    ctx.drawImage(tileCanvas(tiles, def.layer), m, m, size - 2 * m, size - 2 * m);
    return cv;
  }
  const bid = def.block;
  if (def.render === 'shape' || def.render === 'connect') { drawIsoShape(ctx, tiles, bid, size); return cv; }
  const h = def.render === 'slab' ? 0.5 : def.render === 'bed' ? 9 / 16 : 1;
  const s = size / 48, k = 16 / TS;
  const layerOf = (d) => (FACING_BLOCKS.has(bid) && BLOCK_FRONT[bid] !== NO_LAYER && d === 4 && bid !== B.BED ? BLOCK_FRONT[bid] : BLOCK_TEX[bid * 6 + d]);
  const top = tileCanvas(tiles, BLOCK_TEX[bid * 6 + 2]);
  const left = tileCanvas(tiles, layerOf(4));
  const right = tileCanvas(tiles, BLOCK_TEX[bid * 6 + 0]);
  const drop = 22 * (1 - h);
  const face = (img, a, b, c, d, e, f, shade, partial) => {
    ctx.setTransform(a * s * k, b * s * k, c * s * k, d * s * k, e * s, f * s);
    if (partial) ctx.drawImage(img, 0, TS * (1 - h), TS, TS * h, 0, TS * (1 - h), TS, TS * h);
    else ctx.drawImage(img, 0, 0);
    if (shade > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, partial ? TS * (1 - h) : 0, TS, TS);
      ctx.globalCompositeOperation = 'source-over';
    }
  };
  face(top, 21 / 16, -11 / 16, 21 / 16, 11 / 16, 3, 13 + drop, 0, false);
  face(left, 21 / 16, 11 / 16, 0, 22 / 16, 3, 13, 0.26, h < 1);
  face(right, 21 / 16, -11 / 16, 0, 22 / 16, 24, 24, 0.44, h < 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}
