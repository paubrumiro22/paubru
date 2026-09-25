'use strict';
// Textures for the architecture set and village furniture (plaster, marble, roof tiles, slate,
// thatch, dirt paths, lanterns, barrels, the architect's table, cobwebs, iron bars, emerald).

gen('plaster', (d, rng) => {
  const f = fbm(rng, 3, 3), t = fbm(rng, 8, 2);
  fillTile(d, (x, y, k) => {
    // lime plaster: warm off-white, soft trowel swirls and the odd darker speck
    let fa = 0.9 + f[k] * 0.08 + (t[k] - 0.5) * 0.05 + rng() * 0.025;
    if (rng() < 0.012) fa *= 0.86;
    put(d, x, y, [226, 219, 202], quant(fa, 28));
  });
}, { smooth: 0.12, bump: 0.5 });

gen('marble', (d, rng) => {
  const w1 = fbm(rng, 3, 3), w2 = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => {
    // polished white stone with grey veins that meander diagonally
    const u = (x + y * 0.6) / TS * Math.PI * 2 + w1[k] * 7;
    const vein = Math.abs(Math.sin(u)), vein2 = Math.abs(Math.sin(u * 2.3 + w2[k] * 5 + 1.3));
    let c = [236, 234, 230], fa = 0.96 + w2[k] * 0.05;
    if (vein < 0.06) { c = [150, 150, 158]; fa = 0.9 + rng() * 0.08; }
    else if (vein < 0.16 || vein2 < 0.04) { c = [196, 196, 202]; }
    put(d, x, y, c, quant(fa, 30));
  });
  bevelFrame(d, 0, 0, TM, TM, 1.04, 0.9);
}, { smooth: 0.72, bump: 0.5 });

gen('roof_tiles', (d, rng) => {
  // overlapping barrel tiles: four courses, staggered, each tile shaded round and darker where
  // the course above overlaps it
  const tone = Array.from({ length: 32 }, () => 0.84 + rng() * 0.22);
  fillTile(d, (x, y) => {
    const row = y >> 3, ry = y & 7, xo = (x + (row & 1) * 4) & TM, tx = xo >> 3, rx = xo & 7;
    let fa = tone[row * 4 + tx];
    fa *= 0.8 + 0.3 * Math.sin((rx + 0.5) / 8 * Math.PI);    // round profile across the tile
    if (ry === 0) fa *= 0.62;                                  // shadow under the course above
    else if (ry === 1) fa *= 0.82;
    else if (ry >= 6) fa *= 1.08;                              // lit lip
    if (rx === 0) fa *= 0.7;
    put(d, x, y, [178, 82, 52], quant(fa * (0.96 + rng() * 0.06), 16));
  });
}, { smooth: 0.28, bump: 2.2 });

gen('slate', (d, rng) => {
  // rectangular shingles of blue-grey slate in staggered courses
  const tone = Array.from({ length: 32 }, () => 0.82 + rng() * 0.26);
  const f = fbm(rng, 6, 2);
  fillTile(d, (x, y, k) => {
    const row = y >> 3, ry = y & 7, xo = (x + (row & 1) * 5) & TM, tx = Math.floor(xo / 6.4), rx = xo - Math.floor(tx * 6.4);
    let fa = tone[row * 5 + tx] * (0.92 + f[k] * 0.14);
    if (ry === 0) fa *= 0.58; else if (ry === 1) fa *= 0.84; else if (ry === 7) fa *= 1.07;
    if (rx === 0) fa *= 0.72;
    put(d, x, y, [84, 94, 108], quant(fa, 16));
  });
}, { smooth: 0.36, bump: 1.8 });

gen('thatch', (d, rng) => {
  // bundles of straw laid in layers: long strands down the slope, darker between layers
  const strand = Array.from({ length: TS }, () => 0.8 + rng() * 0.35);
  const f = fbm(rng, 2, 2, 0.5, 8);
  fillTile(d, (x, y, k) => {
    const band = y & 7;
    let fa = strand[(x + (y >> 3) * 7) & TM] * (0.9 + f[k] * 0.16);
    if (band === 0) fa *= 0.62; else if (band === 1) fa *= 0.82; else if (band >= 6) fa *= 1.06;
    const c = rng() < 0.08 ? [150, 118, 58] : [204, 166, 86];
    put(d, x, y, c, quant(fa, 14));
  });
}, { smooth: 0.05, bump: 2.4 });

function genPath(d, rng, top) {
  const f = fbm(rng, 4, 3);
  fillTile(d, (x, y, k) => put(d, x, y, [150, 118, 76], quant(0.82 + f[k] * 0.26 + rng() * 0.08, 14)));
  for (let i = 0; i < 30; i++) {
    const cx = Math.floor(rng() * TS), cy = Math.floor(rng() * TS);
    put(d, cx, cy, rng() < 0.5 ? [182, 170, 150] : [104, 84, 58], 0.9 + rng() * 0.15);
    if (rng() < 0.4) put(d, cx + 1, cy, [168, 156, 138]);
  }
  void top;
}
gen('dirt_path', (d, rng) => genPath(d, rng, true), { smooth: 0.06, bump: 1.3 });
gen('dirt_path_side', (d, rng) => {
  genDirt(d, rng);
  const pf = fbm(rng, 4, 3);
  for (let x = 0; x < TS; x++) for (let y = 0; y < 3 + Math.floor(rng() * 2); y++) put(d, x, y, [150, 118, 76], quant(0.82 + pf[y * TS + x] * 0.26, 14));
}, { smooth: 0.06, bump: 1.3 });

// Lantern faces: the lantern box spans x 5..11 of the block, i.e. pixels 10..22 of the texture.
gen('lantern', (d, rng, ctx) => {
  clearTile(d, [40, 40, 44]);
  const iron = [52, 54, 60];
  fillTile(d, (x, y, k) => {
    const frame = x <= 11 || x >= 20 || y <= 17 || y >= 30 || (y >= 2 && y <= 4) || (y >= 18 && y <= 19);
    if (x < 9 || x > 22) return;
    if (frame) { put(d, x, y, iron, 0.9 + rng() * 0.2); return; }
    const glow = 1 - Math.abs(x - 15.5) / 7;
    put(d, x, y, [255, 196, 96], 0.8 + glow * 0.3);
    ctx.emit[k] = 0.75 + glow * 0.25;
  });
}, { smooth: 0.5, bump: 0.6 });
gen('lantern_top', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, [52, 54, 60], 0.85 + rng() * 0.25));
  sprDisc(d, 16, 16, 3, [34, 34, 38]);
}, { smooth: 0.45, bump: 0.8 });

gen('barrel_side', (d, rng) => {
  const stave = Array.from({ length: 6 }, () => 0.84 + rng() * 0.22);
  const g = fbm(rng, 16, 2, 0.5, 2);
  fillTile(d, (x, y, k) => {
    const s = Math.floor(x / 5.34), sx = x - Math.floor(s * 5.34);
    let fa = stave[s] * (0.88 + g[k] * 0.2);
    if (sx === 0) fa *= 0.66;
    const hoop = (y >= 5 && y <= 7) || (y >= 24 && y <= 26);
    if (hoop) { put(d, x, y, [86, 86, 92], (y === 5 || y === 24 ? 1.15 : y === 7 || y === 26 ? 0.7 : 0.95) * (0.95 + rng() * 0.1)); return; }
    put(d, x, y, [150, 104, 58], quant(fa, 12));
  });
}, { smooth: 0.22, bump: 1.6 });
gen('barrel_top', (d, rng) => {
  genPlanks(d, rng, [158, 112, 64]);
  fillTile(d, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (r > 14.5) put(d, x, y, [86, 86, 92], 0.9 + rng() * 0.15);
    else if (r > 13.2) put(d, x, y, [110, 76, 42]);
  });
  sprRect(d, 14, 14, 18, 18, [70, 48, 28]);
}, { smooth: 0.22, bump: 1.4 });

gen('arch_table_top', (d, rng) => {
  genPlanks(d, rng, [170, 128, 80]);
  // a blueprint pinned to the table, with a floor plan, and a set square
  sprRect(d, 4, 3, 26, 22, [52, 94, 170]);
  for (let x = 4; x < 26; x++) for (let y = 3; y < 22; y++) {
    const line = (x === 7 || x === 22 || y === 6 || y === 18) && x >= 7 && x <= 22 && y >= 6 && y <= 18;
    const inner = (x === 14 && y >= 6 && y <= 13) || (y === 13 && x >= 7 && x <= 14);
    const grid = (x % 3 === 0 || y % 3 === 0) && rng() < 0.3;
    if (line || inner) put(d, x, y, [226, 238, 255]);
    else if (grid) put(d, x, y, [80, 124, 196]);
  }
  put(d, 18, 13, [226, 238, 255]); put(d, 19, 13, [226, 238, 255]);
  sprPoly(d, [[20, 20], [30, 30], [20, 30]], [214, 200, 120]);
  sprPoly(d, [[22, 25], [26, 29], [22, 29]], [170, 128, 80]);
}, { smooth: 0.3, bump: 1.2 });
gen('arch_table_side', (d, rng) => {
  genPlanks(d, rng, [150, 110, 66]);
  for (const x0 of [3, 17]) {
    sprRect(d, x0, 10, x0 + 12, 20, [120, 86, 50]);
    fillTile(d, (x, y) => { if (x >= x0 && x < x0 + 12 && (y === 10 || x === x0)) put(d, x, y, [170, 128, 80]); if (x >= x0 && x < x0 + 12 && (y === 19 || x === x0 + 11)) put(d, x, y, [84, 60, 34]); });
    sprRect(d, x0 + 5, 14, x0 + 7, 16, [214, 196, 120]);
  }
  sprRect(d, 0, 0, TS, 3, [120, 86, 50]);
}, { smooth: 0.24, bump: 1.4 });

gen('cobweb', (d) => {
  clearTile(d, [230, 232, 236]);
  const c = [232, 234, 240];
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2 + 0.2;
    sprSeg(d, 16, 16, 16 + Math.cos(ang) * 17, 16 + Math.sin(ang) * 17, 0.9, c);
  }
  for (const r of [4, 8, 12]) {
    let prev = null;
    for (let a = 0; a <= 8; a++) {
      const ang = a / 8 * Math.PI * 2 + 0.2, rr = r + ((a * 7) % 3) * 0.6;
      const p = [16 + Math.cos(ang) * rr, 16 + Math.sin(ang) * rr];
      if (prev) sprSeg(d, prev[0], prev[1], p[0], p[1], 0.8, c);
      prev = p;
    }
  }
}, { bump: 0, smooth: 0.1 });

gen('iron_bars', (d, rng) => {
  clearTile(d, [120, 122, 128]);
  fillTile(d, (x, y) => {
    const bar = [6, 14, 22, 30].some((b) => x >= b && x < b + 4 && !(b === 30 && x > 31)) || x < 2;
    const band = y === 2 || y === 3 || y === 28 || y === 29;
    if (!bar && !band) return;
    let fa = 0.9 + rng() * 0.1;
    const bx = ((x + 2) & 7);
    if (bar && bx === 0) fa *= 1.2; else if (bar && bx === 3) fa *= 0.7;
    put(d, x, y, [120, 122, 128], fa);
  });
}, { smooth: 0.55, bump: 0.8 });

gen('emerald_ore', (d, rng, c) => genOre(d, rng, c, [40, 196, 96], [160, 255, 186], [56, 96, 70]), { bump: 1.8 });
gen('emerald_block', (d, rng) => {
  const f = fbm(rng, 2, 2, 0.5, 8);
  fillTile(d, (x, y, k) => {
    let fa = 0.9 + f[k] * 0.14;
    const a = (x + y) & 15; fa *= a < 8 ? 1.07 : 0.94;
    put(d, x, y, [48, 190, 104], quant(fa, 18));
  });
  bevelFrame(d, 0, 0, TM, TM, 1.2, 0.7);
  bevelFrame(d, 2, 2, TM - 2, TM - 2, 0.85, 1.1);
}, { smooth: 0.7, bump: 1.4 });

sprite('i_lantern', (d, rng, ctx) => {
  sprSeg(d, 16, 1, 16, 6, 1.6, [60, 60, 66]);
  sprRect(d, 11, 6, 21, 9, [52, 54, 60]);
  sprRect(d, 10, 9, 22, 27, [52, 54, 60]);
  sprRect(d, 12, 11, 20, 25, [255, 200, 100]);
  sprRect(d, 14, 13, 18, 23, [255, 236, 170]);
  sprRect(d, 9, 27, 23, 30, [44, 44, 50]);
  for (let y = 11; y < 25; y++) for (let x = 12; x < 20; x++) ctx.emit[y * TS + x] = 1;
});

sprite('i_emerald', (d) => {
  sprPoly(d, [[16, 4], [25, 11], [25, 21], [16, 28], [7, 21], [7, 11]], [40, 200, 100]);
  sprPoly(d, [[16, 8], [21, 12], [21, 20], [16, 24], [11, 20], [11, 12]], [90, 236, 150]);
  sprPoly(d, [[16, 8], [21, 12], [16, 14], [11, 12]], [190, 255, 214]);
});
function drawFish(d, body, belly, fin) {
  sprEllipse(d, 15, 16, 10, 5.5, -0.35, body);
  sprEllipse(d, 14, 18, 8, 3, -0.35, belly);
  sprPoly(d, [[24, 12], [31, 6], [29, 16], [31, 25]], fin);
  sprPoly(d, [[12, 11], [17, 7], [19, 12]], fin);
  sprDisc(d, 8.5, 15, 1.4, [20, 20, 24]);
}
sprite('i_raw_fish', (d) => drawFish(d, [110, 150, 170], [200, 214, 214], [90, 120, 140]));
sprite('i_cooked_fish', (d) => drawFish(d, [176, 116, 58], [222, 176, 110], [140, 86, 40]));
sprite('i_enchanted_book', (d, rng, ctx) => {
  sprRect(d, 7, 5, 26, 28, [120, 40, 150]);
  sprRect(d, 9, 7, 24, 26, [150, 60, 180]);
  sprRect(d, 24, 6, 27, 27, [236, 226, 196]);
  sprRect(d, 12, 11, 21, 13, [255, 214, 90]);
  sprRect(d, 12, 15, 19, 16, [255, 214, 90]);
  for (const [x, y] of [[10, 22], [20, 9], [22, 20], [14, 25]]) { sprRect(d, x, y, x + 2, y + 2, [255, 240, 170]); ctx.emit[y * TS + x] = 0.8; }
});

gen('solar_panel', (d, rng) => {
  // dark blue cells in a silver frame, a sheen across them
  fillTile(d, (x, y) => {
    const frame = (x & 15) === 0 || (y & 15) === 0;
    const grid = (x & 3) === 0 || (y & 7) === 0;
    let c = [26, 40, 88], f = 0.9 + rng() * 0.08 + ((x + y) % 32 < 6 ? 0.25 : 0);
    if (frame) { c = [176, 182, 190]; f = 1; } else if (grid) c = [60, 76, 120];
    put(d, x, y, c, f);
  });
}, { smooth: 0.9, bump: 0.6 });

// ---- stadium pieces ----
function genSeat(d, rng, c) {
  // moulded plastic: flat colour, a soft sheen down the middle and darker edges
  fillTile(d, (x, y) => {
    const e = Math.min(x, y, TM - x, TM - y);
    let f = 0.9 + 0.12 * Math.exp(-((x - 12) ** 2) / 60) + rng() * 0.02;
    if (e === 0) f *= 0.72; else if (e === 1) f *= 0.88;
    put(d, x, y, c, quant(f, 24));
  });
}
gen('seat_red', (d, rng) => genSeat(d, rng, [190, 26, 52]), { smooth: 0.6, bump: 0.3 });
gen('seat_blue', (d, rng) => genSeat(d, rng, [36, 52, 150]), { smooth: 0.6, bump: 0.3 });
gen('seat_yellow', (d, rng) => genSeat(d, rng, [236, 184, 30]), { smooth: 0.6, bump: 0.3 });
gen('seat_white', (d, rng) => genSeat(d, rng, [226, 228, 230]), { smooth: 0.6, bump: 0.3 });

function genLed(d, rng, ctx, c, glow) {
  // a screen of round pixels on a black mask, each pixel lit by itself
  fillTile(d, (x, y, k) => {
    const px = x & 3, py = y & 3, dot = px < 3 && py < 3, core = px === 1 && py === 1;
    if (dot) { put(d, x, y, c, (core ? 1 : 0.86) + rng() * 0.08); ctx.emit[k] = core ? glow : glow * 0.8; }
    else { put(d, x, y, [16, 16, 22]); ctx.emit[k] = glow * 0.1; }
  });
}
gen('led_blue', (d, rng, ctx) => genLed(d, rng, ctx, [40, 90, 230], 0.55), { smooth: 0.8, bump: 0.2 });
gen('led_red', (d, rng, ctx) => genLed(d, rng, ctx, [225, 30, 70], 0.65), { smooth: 0.8, bump: 0.2 });
gen('led_yellow', (d, rng, ctx) => genLed(d, rng, ctx, [255, 214, 70], 1), { smooth: 0.8, bump: 0.2 });

gen('membrane', (d, rng) => {
  // underside of the tensile roof: white fabric, faint weave, a seam every half block
  const f = fbm(rng, 4, 2);
  fillTile(d, (x, y, k) => {
    let fa = 0.95 + f[k] * 0.05 + ((x + y) & 1 ? 0.012 : 0);
    if ((y & 15) === 0) fa *= 0.86;
    put(d, x, y, [238, 238, 234], quant(fa, 30));
  });
}, { smooth: 0.25, bump: 0.3 });
gen('membrane_top', (d, rng) => {
  // weather side: deep navy with a sheen and raised seams
  const f = fbm(rng, 3, 2);
  fillTile(d, (x, y, k) => {
    let fa = 0.9 + f[k] * 0.12;
    if ((y & 15) === 0) fa = 1.25; else if ((y & 15) === 1) fa *= 0.8;
    put(d, x, y, [30, 38, 70], quant(fa, 24));
  });
}, { smooth: 0.7, bump: 0.8 });
gen('membrane_edge', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, y < 12 ? [30, 38, 70] : [232, 232, 228], 0.95 + rng() * 0.05));
}, { smooth: 0.5, bump: 0.3 });

gen('alu_slats', (d, rng) => {
  // linear ceiling: narrow silver-grey aluminium strips with dark shadow gaps
  fillTile(d, (x, y) => {
    const k = x & 3;
    let f = k === 3 ? 0.42 : k === 0 ? 1.08 : 0.96;
    f *= 0.97 + rng() * 0.04;
    put(d, x, y, [206, 208, 210], quant(f, 20));
  });
}, { smooth: 0.65, bump: 1.4 });

gen('deck', (d, rng) => {
  // hardwood decking: long boards with staggered butt joints and a dark gap between boards
  const tone = Array.from({ length: 8 }, () => 0.86 + rng() * 0.2);
  const grain = fbm(rng, 2, 3, 0.5, 8);
  fillTile(d, (x, y, k) => {
    const b = y >> 2, joint = ((x + b * 11) & 31) === 0;
    let f = tone[b] * (0.9 + grain[k] * 0.16);
    if ((y & 3) === 3 || joint) f *= 0.5;
    put(d, x, y, [170, 116, 72], quant(f, 18));
  });
}, { smooth: 0.3, bump: 1.2 });
gen('deck_side', (d, rng) => {
  fillTile(d, (x, y) => put(d, x, y, y < 4 ? [170, 116, 72] : [150, 150, 146], (y < 4 ? 0.9 : 0.85) + rng() * 0.08));
}, { smooth: 0.3, bump: 0.6 });
