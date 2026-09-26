'use strict';
// Dimensions, main-thread side: textures and items of the dimension blocks, portals (lighting,
// breaking, travelling and building the other end), each dimension's sky, fog and light, and its
// creatures: ember cubes and cinder wraiths in the Nether, voidwalkers in the End, and the blind
// Warden that sculk shriekers call up in the Deep Dark.

const DIM_INFO = [
  { key: 'overworld', name: 'Overworld', icon: '🌍' },
  { key: 'nether', name: 'The Nether', icon: '🔥', fog: [0.32, 0.07, 0.04], fogD: 0.016, amb: [0.1, 0.055, 0.04], day: 0.27 },
  { key: 'end', name: 'The End', icon: '🌌', fog: [0.07, 0.04, 0.1], fogD: 0.0035, amb: [0.11, 0.1, 0.13], day: 0.78 },
  { key: 'deep', name: 'The Deep Dark', icon: '🕯️', fog: [0.016, 0.032, 0.042], fogD: 0.022, amb: [0.04, 0.056, 0.072], day: 0.27 },
];
// the dimension of a world position (only default worlds have dimensions)
function dimOf(x, z) { return G.world && G.world.gen.type === 'default' ? dimAt(x, z) : DIM_OVER; }

Object.assign(I, { ENDER_PEARL: 400, CINDER_ROD: 401, ECHO_SHARD: 402, NETHER_QUARTZ: 403 });

// ---------------------------------------------------------------- textures ----
function swirl(d, rng, ctx, a, b, c, emit) {
  const f = fbm(rng, 3, 3), g = fbm(rng, 6, 2);
  fillTile(d, (x, y, k) => {
    const u = x / TS - 0.5, v = y / TS - 0.5, r = Math.hypot(u, v), an = Math.atan2(v, u);
    const s = 0.5 + 0.5 * Math.sin(an * 3 + r * 22 + f[k] * 6);
    const col = mixc(mixc(a, b, s), c, Math.max(0, g[k] - 0.6) * 2);
    put(d, x, y, col, quant(0.85 + s * 0.25, 12));
    ctx.emit[k] = emit * (0.7 + s * 0.3);
  });
}
gen('nether_portal', (d, rng, ctx) => swirl(d, rng, ctx, [70, 20, 150], [140, 60, 230], [210, 160, 255], 0.55), { smooth: 0.8, bump: 0.2 });
gen('deep_portal', (d, rng, ctx) => swirl(d, rng, ctx, [8, 44, 54], [24, 130, 140], [130, 230, 220], 0.5), { smooth: 0.8, bump: 0.2 });
gen('end_portal', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const star = rng() < 0.05;
    put(d, x, y, star ? [200, 240, 230] : mixc([6, 10, 18], [20, 60, 60], rng() * 0.4));
    ctx.emit[k] = star ? 1 : 0.15;
  });
}, { smooth: 0.9, bump: 0 });
gen('reinforced_side', (d, rng, ctx) => {
  noiseFill(d, rng, [58, 64, 70], 0.14, 4, 14);
  for (let x = 0; x < TS; x++) for (const y of [0, 1, 30, 31]) put(d, x, y, [34, 38, 44], y === 0 || y === 31 ? 0.8 : 1);
  for (let y = 5; y < 28; y += 7) for (let x = 3; x < 29; x++) if ((x + y) % 5) put(d, x, y, [30, 34, 38]);
  for (const [x, y] of [[8, 9], [23, 9], [15, 16], [8, 23], [23, 23]]) { put(d, x, y, [80, 230, 230]); ctx.emit[y * TS + x] = 1; }
}, { smooth: 0.3, bump: 2 });
gen('reinforced_top', (d, rng) => {
  noiseFill(d, rng, [70, 74, 78], 0.1, 4, 14);
  bevelFrame(d, 0, 0, TM, TM, 1.25, 0.7);
  for (const r of [6, 10]) bevelFrame(d, r, r, TM - r, TM - r, 0.7, 1.2);
  sprDisc(d, 16, 16, 3, [60, 180, 190]);
}, { smooth: 0.3, bump: 2 });
gen('ender_frame_side', (d, rng) => {
  noiseFill(d, rng, [222, 222, 162], 0.12, 5, 16);
  for (let y = 0; y < 8; y++) for (let x = 0; x < TS; x++) put(d, x, y, [60, 110, 90], y === 7 ? 0.7 : 1);
}, { smooth: 0.2, bump: 1.4 });
gen('ender_frame_top', (d, rng, ctx) => {
  noiseFill(d, rng, [60, 110, 90], 0.14, 4, 14);
  bevelFrame(d, 0, 0, TM, TM, 1.2, 0.7);
  fillTile(d, (x, y, k) => { const r = Math.hypot(x - 15.5, y - 15.5); if (r < 6) { put(d, x, y, r < 3 ? [40, 220, 170] : [20, 90, 70]); ctx.emit[k] = r < 3 ? 1 : 0.2; } });
}, { smooth: 0.4, bump: 1.6 });
gen('crying_obsidian', (d, rng, ctx) => {
  TEX_GEN.obsidian(d, rng, ctx);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * TS), y = Math.floor(rng() * TS);
    for (let j = 0; j < 3; j++) { put(d, x, y + j, [150, 60, 255]); ctx.emit[((y + j) & TM) * TS + x] = 0.9; }
  }
}, { smooth: 0.85, bump: 1.4 });
gen('soul_sand', (d, rng) => {
  noiseFill(d, rng, [84, 64, 50], 0.24, 5, 12);
  for (let k = 0; k < 5; k++) {
    const cx = 4 + Math.floor(rng() * 24), cy = 4 + Math.floor(rng() * 24);
    for (const [ex, ey] of [[-2, -1], [2, -1]]) put(d, cx + ex, cy + ey, [40, 28, 22]);
    for (let x = -2; x <= 2; x++) put(d, cx + x, cy + 2, [44, 30, 24]);
  }
}, { smooth: 0.05, bump: 1.8 });
gen('crimson_nylium', (d, rng) => {
  const f = fbm(rng, 6, 3);
  fillTile(d, (x, y, k) => put(d, x, y, f[k] > 0.55 ? [180, 36, 40] : [140, 24, 30], quant(0.8 + f[k] * 0.3 + rng() * 0.1, 10)));
}, { smooth: 0.1, bump: 1.6 });
gen('warped_nylium', (d, rng) => {
  const f = fbm(rng, 6, 3);
  fillTile(d, (x, y, k) => put(d, x, y, f[k] > 0.55 ? [40, 170, 150] : [26, 120, 110], quant(0.8 + f[k] * 0.3 + rng() * 0.1, 10)));
}, { smooth: 0.1, bump: 1.6 });
gen('crimson_nylium_side', (d, rng, ctx) => { TEX_GEN.netherrack(d, rng, ctx); grassOverhang(d, rng, [[180, 36, 40], [150, 28, 32], [110, 20, 26]], 3, 7); }, { smooth: 0.1, bump: 1.6 });
gen('warped_nylium_side', (d, rng, ctx) => { TEX_GEN.netherrack(d, rng, ctx); grassOverhang(d, rng, [[40, 170, 150], [30, 140, 126], [20, 100, 90]], 3, 7); }, { smooth: 0.1, bump: 1.6 });
gen('crimson_stem', (d, rng) => genBark(d, rng, [120, 40, 60], [70, 20, 36]), { smooth: 0.1, bump: 2 });
gen('crimson_stem_top', (d, rng) => genRings(d, rng, [150, 70, 90], [110, 50, 70], [120, 40, 60]), { smooth: 0.1, bump: 1.4 });
gen('warped_stem', (d, rng) => genBark(d, rng, [50, 90, 100], [30, 50, 60]), { smooth: 0.1, bump: 2 });
gen('warped_stem_top', (d, rng) => genRings(d, rng, [60, 140, 130], [40, 110, 104], [50, 90, 100]), { smooth: 0.1, bump: 1.4 });
gen('crimson_planks', (d, rng) => genPlanks(d, rng, [120, 50, 76]), { smooth: 0.26, bump: 1.4 });
gen('warped_planks', (d, rng) => genPlanks(d, rng, [44, 116, 110]), { smooth: 0.26, bump: 1.4 });
gen('nether_wart_block', (d, rng) => { const f = fbm(rng, 5, 3); fillTile(d, (x, y, k) => put(d, x, y, [130, 12, 16], quant(0.75 + f[k] * 0.4 + rng() * 0.1, 10))); }, { smooth: 0.1, bump: 1.8 });
gen('warped_wart_block', (d, rng) => { const f = fbm(rng, 5, 3); fillTile(d, (x, y, k) => put(d, x, y, [20, 130, 124], quant(0.75 + f[k] * 0.4 + rng() * 0.1, 10))); }, { smooth: 0.1, bump: 1.8 });
function fungusSprite(d, rng, stemC, cap, dot) {
  clearTile(d, cap);
  stem(d, [[16, 31], [16, 16]], stemC, 2);
  fillTile(d, (x, y) => {
    const dx = (x + 0.5 - 16.5) / 9, dy = (y + 0.5 - 16) / 7;
    if (y > 16 || dx * dx + dy * dy > 1) return;
    put(d, x, y, (x * 7 + y * 3) % 11 === 0 ? dot : cap, 0.85 + rng() * 0.2 + (16 - y) * 0.01);
  });
}
gen('crimson_fungus', (d, rng) => fungusSprite(d, rng, [230, 200, 170], [170, 30, 36], [250, 160, 60]), { smooth: 0.3, bump: 0.3 });
gen('warped_fungus', (d, rng) => fungusSprite(d, rng, [230, 200, 170], [30, 150, 140], [250, 150, 60]), { smooth: 0.3, bump: 0.3 });
function rootsSprite(d, rng, c) {
  clearTile(d, c);
  for (let b = 0; b < 9; b++) blade(d, rng, 4 + rng() * 24, 10 + Math.floor(rng() * 16), (rng() - 0.5) * 0.4, c, (rng() - 0.5) * 3);
}
gen('crimson_roots', (d, rng) => rootsSprite(d, rng, [170, 30, 50]), { smooth: 0.3, bump: 0.3 });
gen('warped_roots', (d, rng) => rootsSprite(d, rng, [30, 160, 150]), { smooth: 0.3, bump: 0.3 });
gen('nether_quartz_ore', (d, rng, ctx) => {
  TEX_GEN.netherrack(d, rng, ctx);
  for (let i = 0; i < 9; i++) { const x = 3 + Math.floor(rng() * 26), y = 3 + Math.floor(rng() * 26); for (let j = 0; j < 4; j++) put(d, x + (j & 1), y + (j >> 1), [236, 226, 214], 0.9 + rng() * 0.15); }
}, { smooth: 0.3, bump: 1.8 });
gen('nether_gold_ore', (d, rng, ctx) => {
  TEX_GEN.netherrack(d, rng, ctx);
  for (let i = 0; i < 12; i++) { const x = 2 + Math.floor(rng() * 28), y = 2 + Math.floor(rng() * 28); put(d, x, y, [250, 206, 70]); put(d, x + 1, y, [220, 170, 40]); }
}, { smooth: 0.4, bump: 1.8 });
gen('soul_lantern', (d, rng, ctx) => {
  clearTile(d, [40, 40, 44]);
  fillTile(d, (x, y, k) => {
    const frame = x <= 11 || x >= 20 || y <= 17 || y >= 30 || (y >= 2 && y <= 4) || (y >= 18 && y <= 19);
    if (x < 9 || x > 22) return;
    if (frame) { put(d, x, y, [52, 54, 60], 0.9 + rng() * 0.2); return; }
    const glow = 1 - Math.abs(x - 15.5) / 7;
    put(d, x, y, [110, 230, 240], 0.8 + glow * 0.3);
    ctx.emit[k] = 0.75 + glow * 0.25;
  });
}, { smooth: 0.5, bump: 0.6 });
gen('soul_torch', (d, rng, ctx) => {
  clearTile(d, [120, 90, 50]);
  for (let y = 16; y < TS; y++) for (let x = 14; x < 18; x++) put(d, x, y, [134, 98, 54], x === 14 ? 1.15 : x === 17 ? 0.72 : 0.95 + rng() * 0.06);
  const flame = [[230, 255, 255], [120, 230, 250], [60, 180, 220], [30, 110, 150]];
  for (let y = 12; y < 16; y++) for (let x = 14; x < 18; x++) {
    const k = y === 15 ? 3 : (x === 15 || x === 16) && y < 14 ? 0 : y < 14 ? 1 : 2;
    put(d, x, y, flame[k]); ctx.emit[y * TS + x] = 1;
  }
}, { smooth: 0.2, bump: 0.4 });
gen('end_rod', (d, rng, ctx) => {
  clearTile(d, [240, 230, 250]);
  for (let y = 4; y < TS; y++) for (let x = 14; x < 18; x++) { put(d, x, y, [246, 240, 252], x === 14 ? 1.05 : x === 17 ? 0.85 : 1); ctx.emit[y * TS + x] = 0.9; }
  for (let y = 28; y < TS; y++) for (let x = 13; x < 19; x++) put(d, x, y, [130, 110, 150]);
}, { smooth: 0.8, bump: 0.3 });
gen('chorus_plant', (d, rng) => {
  clearTile(d, [120, 80, 120]);
  fillTile(d, (x, y) => {
    const hole = (x > 4 && x < 10 && y > 20 && y < 27) || (x > 20 && x < 27 && y > 4 && y < 11);
    if (hole) return;
    put(d, x, y, rng() < 0.2 ? [170, 130, 170] : [110, 76, 118], 0.9 + rng() * 0.15);
  });
}, { smooth: 0.2, bump: 1.4 });
gen('chorus_flower', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const r = Math.hypot(x - 15.5, y - 15.5);
    put(d, x, y, r < 6 ? [230, 200, 240] : [160, 110, 176], 0.9 + rng() * 0.15);
    ctx.emit[k] = r < 6 ? 0.5 : 0;
  });
}, { smooth: 0.3, bump: 1 });
gen('end_crystal', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const u = Math.abs(x - 15.5) + Math.abs(y - 15.5);
    const c = u < 8 ? [255, 230, 255] : u < 14 ? [230, 140, 240] : [140, 60, 170];
    put(d, x, y, c, 0.9 + rng() * 0.1);
    ctx.emit[k] = u < 14 ? 1 : 0.6;
  });
}, { smooth: 0.9, bump: 0.8 });
gen('purpur_pillar', (d, rng) => {
  noiseFill(d, rng, [168, 122, 168], 0.1, 3, 20);
  for (let y = 0; y < TS; y++) for (const x of [0, 7, 24, 31]) put(d, x, y, [128, 90, 128]);
}, { smooth: 0.3, bump: 1.6 });
gen('purpur_pillar_top', (d, rng) => { noiseFill(d, rng, [168, 122, 168], 0.1, 3, 20); for (const r of [0, 5, 10]) bevelFrame(d, r, r, TM - r, TM - r, 1.1, 0.75); }, { smooth: 0.3, bump: 1.6 });
gen('end_stone_bricks', (d, rng) => brickWall(d, rng, [222, 222, 164], [170, 170, 120], 16, 8, 0.1), { smooth: 0.2, bump: 2 });
function sculkBase(d, rng, ctx) {
  const f = fbm(rng, 5, 3);
  fillTile(d, (x, y, k) => {
    const spark = rng() < 0.04;
    put(d, x, y, spark ? [60, 220, 230] : f[k] > 0.6 ? [16, 50, 62] : [8, 30, 40], 0.85 + f[k] * 0.3);
    ctx.emit[k] = spark ? 1 : 0;
  });
}
gen('sculk', sculkBase, { smooth: 0.2, bump: 1.6 });
gen('sculk_sensor_side', (d, rng, ctx) => { sculkBase(d, rng, ctx); for (let y = 0; y < 8; y++) for (let x = 0; x < TS; x++) put(d, x, y, [20, 90, 110], 0.9 + rng() * 0.1); }, { smooth: 0.3, bump: 1.6 });
gen('sculk_sensor_top', (d, rng, ctx) => {
  sculkBase(d, rng, ctx);
  for (const [x0, y0] of [[6, 6], [22, 6], [6, 22], [22, 22]]) for (let y = -2; y <= 2; y++) for (let x = -1; x <= 1; x++) { put(d, x0 + x, y0 + y, [60, 220, 230]); ctx.emit[(y0 + y) * TS + x0 + x] = 1; }
}, { smooth: 0.3, bump: 1.6 });
gen('sculk_shrieker_side', (d, rng, ctx) => { sculkBase(d, rng, ctx); for (let y = 0; y < 12; y++) for (let x = 0; x < TS; x++) put(d, x, y, [220, 214, 196], 0.85 + rng() * 0.1); }, { smooth: 0.3, bump: 1.8 });
gen('sculk_shrieker_top', (d, rng, ctx) => {
  fillTile(d, (x, y, k) => {
    const r = Math.hypot(x - 15.5, y - 15.5);
    put(d, x, y, r < 5 ? [30, 60, 70] : r < 12 ? [226, 220, 204] : [16, 50, 62], 0.9 + rng() * 0.1);
    ctx.emit[k] = r < 5 ? 0.6 : 0;
  });
}, { smooth: 0.3, bump: 1.8 });
gen('sculk_catalyst_side', (d, rng, ctx) => { sculkBase(d, rng, ctx); for (let y = 8; y < TS; y++) for (let x = 0; x < TS; x++) put(d, x, y, [226, 220, 204], (x + y) % 5 ? 0.9 : 0.75); }, { smooth: 0.3, bump: 1.8 });
gen('sculk_catalyst_top', (d, rng, ctx) => { sculkBase(d, rng, ctx); sprDisc(d, 16, 16, 6, [120, 240, 250]); for (let i = 0; i < TSS; i++) if (Math.hypot((i % TS) - 16, Math.floor(i / TS) - 16) < 6) ctx.emit[i] = 1; }, { smooth: 0.3, bump: 1.8 });
gen('glow_lichen', (d, rng, ctx) => {
  clearTile(d, [120, 180, 150]);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng() * TS), y = 14 + Math.floor(rng() * 18);
    put(d, x, y, rng() < 0.3 ? [220, 250, 200] : [120, 170, 140]);
    ctx.emit[y * TS + x] = 0.8;
  }
}, { smooth: 0.3, bump: 0.3 });

// item sprites
sprite('i_ender_pearl', (d) => { sprDisc(d, 16, 16, 9, [20, 90, 80]); sprDisc(d, 15, 15, 6, [40, 150, 130]); sprDisc(d, 13, 13, 2.5, [150, 240, 220]); });
sprite('i_cinder_rod', (d) => { sprSeg(d, 9, 25, 23, 7, 3, [250, 190, 60]); sprSeg(d, 10, 24, 22, 8, 1.2, [255, 240, 150]); });
sprite('i_echo_shard', (d) => { sprPoly(d, [[16, 4], [25, 14], [18, 28], [8, 18]], [20, 90, 110]); sprPoly(d, [[16, 8], [21, 14], [17, 22], [12, 17]], [80, 220, 230]); });
sprite('i_nether_quartz', (d) => { sprPoly(d, [[8, 20], [14, 8], [22, 10], [26, 22], [16, 27]], [230, 220, 210]); sprPoly(d, [[14, 11], [20, 12], [18, 18]], [255, 252, 246]); });
sprite('i_soul_lantern', (d, rng, ctx) => {
  sprRect(d, 10, 8, 22, 28, [52, 54, 60]);
  sprRect(d, 12, 12, 20, 25, [110, 230, 240]);
  sprRect(d, 14, 4, 18, 8, [52, 54, 60]);
});

// ---------------------------------------------------------------- items ----
defItem(I.ENDER_PEARL, 'Ender Pearl', { sprite: 'i_ender_pearl', stack: 16 });
defItem(I.CINDER_ROD, 'Cinder Rod', { sprite: 'i_cinder_rod', fuel: 120 });
defItem(I.ECHO_SHARD, 'Echo Shard', { sprite: 'i_echo_shard' });
defItem(I.NETHER_QUARTZ, 'Nether Quartz', { sprite: 'i_nether_quartz' });
ITEM_DEF[B.SOUL_LANTERN].layer = defTex('i_soul_lantern');
for (const id of [B.NETHER_PORTAL, B.END_PORTAL, B.DEEP_PORTAL]) delete ITEM_DEF[id];
shaped(B.ENDER_FRAME, 4, ['POP', 'ORO', 'POP'], { P: I.ENDER_PEARL, O: B.OBSIDIAN, R: I.CINDER_ROD });
shaped(B.REINFORCED_DEEPSLATE, 4, ['DDD', 'DAD', 'DDD'], { D: B.DEEPSLATE_BRICKS, A: B.AMETHYST_BLOCK });
shapeless(B.CRIMSON_PLANKS, 4, [B.CRIMSON_STEM]);
shapeless(B.WARPED_PLANKS, 4, [B.WARPED_STEM]);
shaped(B.QUARTZ_BLOCK, 1, ['QQ', 'QQ'], { Q: I.NETHER_QUARTZ });
shaped(B.SOUL_TORCH, 4, ['C', 'S', 'X'], { C: TAG.coal, S: I.STICK, X: B.SOUL_SAND });
shaped(B.SOUL_LANTERN, 1, [' I ', 'ITI', ' I '], { I: I.IRON_INGOT, T: B.SOUL_TORCH });
shaped(B.END_ROD, 4, ['C', 'P'], { C: I.CINDER_ROD, P: I.ENDER_PEARL });
four(B.END_STONE_BRICKS, 4, B.END_STONE);
shaped(B.PURPUR_PILLAR, 2, ['P', 'P'], { P: B.PURPUR });
shaped(B.CRYING_OBSIDIAN, 1, [' E ', 'EOE', ' E '], { E: I.ECHO_SHARD, O: B.OBSIDIAN });
shaped(B.NETHER_BRICK_FENCE, 6, ['NBN', 'NBN'], { N: B.NETHER_BRICKS, B: B.NETHERRACK });
SMELT[B.NETHER_GOLD_ORE] = I.GOLD_INGOT;
SMELT[B.NETHER_QUARTZ_ORE] = I.NETHER_QUARTZ;
ITEM_DEF[B.CRIMSON_STEM].fuel = ITEM_DEF[B.WARPED_STEM].fuel = 0;   // nether wood does not burn
Object.assign(LOOT, {
  fortress: [[I.GOLD_INGOT, 2, 6, 0.6], [I.DIAMOND, 1, 2, 0.2], [I.CINDER_ROD, 1, 3, 0.35], [B.OBSIDIAN, 2, 6, 0.4], [I.IRON_INGOT, 2, 5, 0.5], [I.GOLDEN_APPLE, 1, 1, 0.15], [I.ENCHANTED_BOOK, 1, 1, 0.2]],
  endcity: [[I.DIAMOND, 2, 5, 0.6], [I.EMERALD, 3, 8, 0.6], [I.ENDER_PEARL, 2, 5, 0.6], [I.ENCHANTED_BOOK, 1, 2, 0.45], [I.GOLD_INGOT, 3, 8, 0.6], [I.TOOL0 + 23, 1, 1, 0.2]],
  ancient: [[I.ECHO_SHARD, 1, 3, 0.5], [I.DIAMOND, 1, 3, 0.35], [I.ENCHANTED_BOOK, 1, 2, 0.4], [B.SCULK, 4, 10, 0.4], [I.GOLDEN_APPLE, 1, 2, 0.3], [B.AMETHYST_BLOCK, 1, 3, 0.3], [I.ARMOR0 + 14, 1, 1, 0.08]],
});
{
  const drops0 = blockDrops;
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (IS_PORTAL(id)) return [];
    if (id === B.NETHER_QUARTZ_ORE) return canHarvest(id, toolItem) ? [[I.NETHER_QUARTZ, 1 + (rnd() < 0.3 ? 1 : 0)]] : [];
    if (id === B.CRIMSON_NYLIUM || id === B.WARPED_NYLIUM) return canHarvest(id, toolItem) ? [[B.NETHERRACK, 1]] : [];
    if (id === B.CRIMSON_ROOTS || id === B.WARPED_ROOTS || id === B.GLOW_LICHEN) { const d = ITEM_DEF[toolItem]; return d && d.tool === TOOL_SHEARS ? [[id, 1]] : []; }
    return drops0(id, toolItem, rnd);
  };
}

// ---------------------------------------------------------------- portals ----
const PORTAL_FRAME = { [B.NETHER_PORTAL]: B.OBSIDIAN, [B.DEEP_PORTAL]: B.REINFORCED_DEEPSLATE };
const Portals = {
  inside: 0, cd: 0, needExit: false, lastKind: 0,

  // Flint and steel on an obsidian (Nether) or reinforced deepslate (Deep Dark) frame.
  ignite(hit) {
    const frame = hit.id;
    const kind = frame === B.OBSIDIAN ? B.NETHER_PORTAL : frame === B.REINFORCED_DEEPSLATE ? B.DEEP_PORTAL : 0;
    if (!kind) return false;
    const x = hit.pos[0] + hit.normal[0], y = hit.pos[1] + hit.normal[1], z = hit.pos[2] + hit.normal[2];
    if (dimOf(x, z) === DIM_END) { G.ui.toast('Portals do not light in the End'); return true; }
    for (const axis of [0, 2]) {
      const cells = this.frameInside(x, y, z, axis, frame);
      if (!cells) continue;
      editBlocks(cells.map(([cx, cy, cz]) => [cx, cy, cz, kind, axis === 0 ? 4 : 0]));
      sfx('portal', [x + 0.5, y + 0.5, z + 0.5], 1, kind === B.DEEP_PORTAL ? 0.6 : 1);
      Act.swingHand();
      if (G.mode === 'survival' && G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
      G.ui.invDirty();
      G.ui.toast(kind === B.DEEP_PORTAL ? '🕯️ The portal to the Deep Dark hums' : '🔥 The Nether portal is lit');
      return true;
    }
    G.ui.toast('Build a closed frame: at least 2 wide and 3 tall inside');
    return true;
  },

  // Air cells enclosed by a frame of `frame` in the vertical plane along `axis` (0 = x, 2 = z).
  frameInside(x, y, z, axis, frame) {
    const w = G.world;
    const open = (id) => id === B.AIR || (BLOCK_REPLACE[id] && !IS_LIQUID(id));
    if (!open(w.getBlock(x, y, z))) return null;
    const seen = new Set(), stack = [[x, y, z]], cells = [];
    let minA = 1e9, maxA = -1e9, minY = 1e9, maxY = -1e9;
    while (stack.length) {
      const [cx, cy, cz] = stack.pop();
      const k = cx + ',' + cy + ',' + cz;
      if (seen.has(k)) continue;
      seen.add(k);
      const id = w.getBlock(cx, cy, cz);
      if (id === frame) continue;
      if (!open(id)) return null;
      cells.push([cx, cy, cz]);
      if (cells.length > 21 * 21) return null;
      const a = axis === 0 ? cx : cz;
      minA = Math.min(minA, a); maxA = Math.max(maxA, a); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      if (maxA - minA > 20 || maxY - minY > 20) return null;
      for (const [da, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stack.push(axis === 0 ? [cx + da, cy + dy, cz] : [cx, cy + dy, cz + da]);
    }
    if (maxA - minA < 1 || maxY - minY < 2) return null;
    return cells;
  },

  // An ender frame was placed: a complete ring of twelve round a 3x3 hole opens the End portal.
  checkEnderRing(x, y, z) {
    const w = G.world;
    for (let cz = z - 3; cz <= z + 3; cz++) for (let cx = x - 3; cx <= x + 3; cx++) {
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2 && ok; dx++) {
        const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2);
        const id = w.getBlock(cx + dx, y, cz + dz);
        if (ring) ok = id === B.ENDER_FRAME;
        else if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) ok = id === B.AIR || (BLOCK_REPLACE[id] && !IS_LIQUID(id));
      }
      if (!ok) continue;
      const list = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) list.push([cx + dx, y, cz + dz, B.END_PORTAL, 0]);
      editBlocks(list);
      sfx('portal', [cx + 0.5, y + 0.5, cz + 0.5], 1, 0.5);
      G.ui.toast('🌌 The End portal opens');
      return;
    }
  },

  // A frame block went away: the portal it held collapses.
  breakNear(x, y, z) {
    const w = G.world, list = [], seen = new Set();
    const stack = [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]];
    while (stack.length && list.length < 600) {
      const [cx, cy, cz] = stack.pop();
      const k = cx + ',' + cy + ',' + cz;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!IS_PORTAL(w.getBlock(cx, cy, cz))) continue;
      list.push([cx, cy, cz, B.AIR]);
      stack.push([cx + 1, cy, cz], [cx - 1, cy, cz], [cx, cy + 1, cz], [cx, cy - 1, cz], [cx, cy, cz + 1], [cx, cy, cz - 1]);
    }
    if (list.length) { editBlocks(list); sfx('break_5', [x + 0.5, y + 0.5, z + 0.5], 0.8, 0.6); }
  },

  // Standing in a portal for a moment takes you through.
  update(dt) {
    this.cd -= dt;
    const p = G.player, w = G.world;
    if (!p || G.stats.dead || G.onTitle) return;
    let kind = 0;
    for (const dy of [0.1, 0.9, 1.6]) {
      const id = w.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] + dy), Math.floor(p.pos[2]));
      if (IS_PORTAL(id)) { kind = id; break; }
    }
    if (!kind) { this.inside = 0; this.needExit = false; return; }
    if (this.needExit || this.cd > 0 || G.vehicle) return;
    this.inside += dt;
    if (this.inside > 0.2 && Math.random() < dt * 20) Particles.add(Particles.base(p.pos[0] + rand(-0.5, 0.5), p.pos[1] + rand(0, 2), p.pos[2] + rand(-0.5, 0.5), {
      vy: rand(-0.5, 0.5), life: 0.8, max: 0.8, size: 0.06, layer: T.p_crit, r: 0.7, g: 0.4, b: 1, glow: true, collide: false }));
    const wait = kind === B.END_PORTAL ? 0.05 : G.mode === 'creative' ? 0.6 : 2.5;
    if (this.inside >= wait) { this.inside = 0; this.travel(kind); }
  },

  travel(kind, force) {
    const p = G.player;
    const from = dimOf(p.pos[0], p.pos[2]);
    let to;
    if (force !== undefined) to = force;
    else if (kind === B.END_PORTAL) to = from === DIM_END ? DIM_OVER : DIM_END;
    else if (kind === B.NETHER_PORTAL) to = from === DIM_NETHER ? DIM_OVER : DIM_NETHER;
    else to = from === DIM_DEEP ? DIM_OVER : DIM_DEEP;
    if (G.world.gen.type !== 'default') { G.ui.toast('Dimensions only exist in normal worlds'); return; }
    if (G.vehicle) Vehicles.dismount(true);
    let dest;
    if (to === DIM_OVER && (from === DIM_END || kind === 0)) dest = this.homeSpot();
    else if (to === DIM_END) dest = this.endSpot();
    else {
      const [tx, tz] = dimTarget(from, to, Math.floor(p.pos[0]), Math.floor(p.pos[2]));
      dest = this.portalSpot(kind || (to === DIM_DEEP ? B.DEEP_PORTAL : B.NETHER_PORTAL), to, tx, tz);
    }
    p.pos = dest.slice(); p.vel = [0, 0, 0]; p.fallStart = null; p.landed = 0;
    Particles.list.length = 0;
    prepareArea(p.pos[0], p.pos[2], 2);
    liftOutOfBlocks(p);
    this.cd = 3; this.needExit = true; this.inside = 0;
    G.region = null;
    sfx('portal', null, 1, to === DIM_DEEP ? 0.5 : to === DIM_END ? 0.7 : 1);
    const info = DIM_INFO[to];
    G.ui.banner(info.icon, info.name);
    if (typeof Net !== 'undefined') Net.teleported();
    saveWorld();
  },

  homeSpot() {
    let sp = G.worldSpawn;
    if (G.spawnPoint) sp = G.spawnPoint;
    prepareArea(sp[0], sp[2], 1);
    return [sp[0], sp[1], sp[2]];
  },

  // The End: arrive on an obsidian landing at the edge of the main island.
  endSpot() {
    const [tx, tz] = dimTarget(DIM_OVER, DIM_END, 0, 0);
    prepareArea(tx, tz, 2);
    const [lx, lz] = dimLocal(DIM_END, tx, tz);
    const col = endColumn(dimNoise(G.world.gen), lx, lz);
    const y = col ? col[0] : 50;
    const list = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      list.push([tx + dx, y, tz + dz, B.OBSIDIAN]);
      for (let k = 1; k <= 3; k++) if (G.world.getBlock(tx + dx, y + k, tz + dz) !== B.AIR) list.push([tx + dx, y + k, tz + dz, B.AIR]);
    }
    editBlocks(list);
    return [tx + 0.5, y + 1, tz + 0.5];
  },

  // Find a portal of this kind near (tx, tz) in dimension `dim`, or build one; returns where to stand.
  portalSpot(kind, dim, tx, tz) {
    const w = G.world;
    prepareArea(tx, tz, 3);
    let best = null, bd = 1e9;
    const pcx = Math.floor(tx / CS), pcz = Math.floor(tz / CS);
    for (let cz = pcz - 3; cz <= pcz + 3; cz++) for (let cx = pcx - 3; cx <= pcx + 3; cx++) {
      const c = w.getChunk(cx, cz);
      if (!c) continue;
      const b = c.blocks;
      for (let i = 0; i < b.length; i++) {
        if (b[i] !== kind) continue;
        const x = cx * CS + (i & 15), z = cz * CS + ((i >> 4) & 15), y = i >> 8;
        if (w.getBlock(x, y - 1, z) === kind) continue;   // bottom row only
        const d = Math.hypot(x - tx, z - tz);
        if (d < bd) { bd = d; best = [x, y, z]; }
      }
    }
    if (best) {
      const [x, y, z] = best;
      const f = w.getFacing(x, y, z);
      const out = f === 0 || f === 1 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [dx, dz] of out) if (!BLOCK_SOLID[w.getBlock(x + dx, y, z + dz)] && !BLOCK_SOLID[w.getBlock(x + dx, y + 1, z + dz)]) return [x + dx + 0.5, y, z + dz + 0.5];
      return [x + 0.5, y, z + 0.5];
    }
    return this.buildPortal(kind, dim, tx, tz);
  },

  buildPortal(kind, dim, tx, tz) {
    const w = G.world;
    const frame = PORTAL_FRAME[kind];
    const free = (x, y, z) => { const id = w.getBlock(x, y, z); return !BLOCK_SOLID[id] && !IS_LIQUID(id); };
    const fits = (x, y, z) => {
      for (let i = -1; i <= 4; i++) for (let k = -1; k <= 1; k++) for (let j = 1; j <= 4; j++) if (!free(x + i, y + j, z + k)) return false;
      for (let i = 0; i <= 3; i++) if (!BLOCK_SOLID[w.getBlock(x + i, y, z)]) return false;
      return true;
    };
    let spot = null;
    for (let r = 0; r <= 14 && !spot; r += 2) for (let a = 0; a < Math.max(1, r * 3) && !spot; a++) {
      const an = a / Math.max(1, r * 3) * Math.PI * 2;
      const x = Math.round(tx + Math.cos(an) * r), z = Math.round(tz + Math.sin(an) * r);
      if (dim === DIM_OVER) {
        const h = w.surfaceHeight(x, z);
        if (h > 0 && !IS_LIQUID(w.getBlock(x, h, z)) && fits(x, h, z)) spot = [x, h, z];
      } else {
        const y0 = dim === DIM_NETHER ? NETHER_LAVA + 2 : DEEP_WATER + 2, y1 = dim === DIM_NETHER ? 100 : 64;
        for (let y = y0; y < y1 && !spot; y++) if (fits(x, y, z)) spot = [x, y, z];
      }
    }
    let [x, y, z] = spot || [tx, 0, tz];
    if (!spot) y = dim === DIM_OVER ? Math.max(SEA, w.surfaceHeight(tx, tz)) : dim === DIM_NETHER ? 64 : 40;
    const list = [];
    for (let i = -1; i <= 4; i++) for (let k = -1; k <= 1; k++) {
      // a floor to stand on and a clear room around the frame
      if (!BLOCK_SOLID[w.getBlock(x + i, y, z + k)] || IS_LIQUID(w.getBlock(x + i, y, z + k))) list.push([x + i, y, z + k, frame]);
      for (let j = 1; j <= 4; j++) if (w.getBlock(x + i, y + j, z + k) !== B.AIR) list.push([x + i, y + j, z + k, B.AIR]);
    }
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 4; j++) {
      const edge = i === 0 || i === 3 || j === 0 || j === 4;
      list.push([x + i, y + j, z, edge ? frame : kind, edge ? undefined : 4]);
    }
    editBlocks(list);
    return [x + 2, y + 1, z + 1.5];
  },

  // Frames: placing an ender frame may open the End; breaking frame blocks closes portals.
  onEdit(x, y, z, id, old) {
    if (id === B.ENDER_FRAME) this.checkEnderRing(x, y, z);
    if ((old === B.OBSIDIAN || old === B.REINFORCED_DEEPSLATE || old === B.ENDER_FRAME) && id !== old) this.breakNear(x, y, z);
  },
};
{
  const edit0 = editBlock;
  // eslint-disable-next-line no-global-assign
  editBlock = function (x, y, z, id, facing) {
    const old = G.world.getBlock(x, y, z);
    const r = edit0(x, y, z, id, facing);
    if (r && old !== id) {
      Portals.onEdit(x, y, z, id, old);
      if (dimOf(x, z) === DIM_DEEP) DimMobs.noise([x + 0.5, y + 0.5, z + 0.5], 1);
    }
    return r;
  };
  const sleep0 = trySleep;
  // eslint-disable-next-line no-global-assign
  trySleep = function (x, y, z) {
    if (dimOf(x, z) !== DIM_OVER) { G.ui.toast('You cannot sleep here — the bed will not let you rest'); return; }
    return sleep0(x, y, z);
  };
}

// ------------------------------------------------------------ atmosphere ----
// Called by the renderer each frame inside a dimension.
function dimAtmosphere(r, dim) {
  const A = r.atmo, info = DIM_INFO[dim];
  const dark = DimMobs.darkness;
  A.dim = [info.fog[0] * (1 - dark * 0.8), info.fog[1] * (1 - dark * 0.8), info.fog[2] * (1 - dark * 0.8), 1];
  A.dimAmb = info.amb.map((v) => v * (1 - dark * 0.85));
  A.fogDensity = info.fogD * (1 + dark * 2.5);
  A.sunColor = [0, 0, 0];
  A.lightColor = dim === DIM_END ? [0.12, 0.1, 0.16] : [0, 0, 0];
  A.cloudCover = 0;
}
{
  const wu = Weather.update;
  Weather.update = function (dt, cam) {
    if (!dimOf(cam.pos[0], cam.pos[2])) return wu.call(this, dt, cam);
    this.amount = 0; this.rainFx = 0; this.flash = 0; this.bolts.length = 0;
    this.wetness = Math.max(0, this.wetness - dt / 5); this.snowCover = Math.max(0, this.snowCover - dt / 5);
    this.sound(0, cam.pos);
  };
  const lu = Wildlife.update;
  Wildlife.update = function (dt, cam) {
    if (dimOf(cam.pos[0], cam.pos[2])) { this.reset(); return; }
    return lu.call(this, dt, cam);
  };
}

// ------------------------------------------------------------------ mobs ----
Object.assign(MOB_TYPES, {
  ember: { name: 'Ember Cube', hw: 0.5, h: 1.0, hp: 16, speed: 2.8, hostile: true, dmg: [3, 4, 6], drops: [[B.MAGMA, 0, 1]], fireproof: true, custom: 'ember' },
  wraith: { name: 'Cinder Wraith', hw: 0.3, h: 1.8, hp: 20, speed: 2.2, hostile: true, drops: [[I.CINDER_ROD, 0, 1]], fireproof: true, custom: 'wraith' },
  voidwalker: { name: 'Voidwalker', hw: 0.3, h: 2.9, hp: 40, speed: 3.2, hostile: true, dmg: [4, 7, 10], drops: [[I.ENDER_PEARL, 0, 1]], custom: 'voidwalker' },
  warden: { name: 'Warden', hw: 0.45, h: 2.9, hp: 250, speed: 1.7, hostile: true, dmg: [12, 16, 24], drops: [[B.SCULK_CATALYST, 1, 1], [I.ECHO_SHARD, 2, 4]], fireproof: true, custom: 'warden' },
});
Object.assign(MOB_SKIN_SLOT, { ember: 12, wraith: 13, voidwalker: 14, warden: 15 });
Object.assign(MOB_MODELS, {
  ember: [
    { id: 'body', box: [-8, 0, -8, 8, 16, 8] },
  ],
  wraith: [
    { id: 'head', box: [-4, 20, -4, 4, 28, 4], pivot: [0, 20, 0], role: 'head' },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a = i / 8 * Math.PI * 2, r = i % 2 ? 7 : 5, y = i % 2 ? 4 : 11;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      return { id: 'rod' + i, box: [x - 1, y, z - 1, x + 1, y + 8, z + 1], uv: 'rod' };
    }),
  ],
  voidwalker: [
    { id: 'body', box: [-4, 26, -2, 4, 38, 2] },
    { id: 'head', box: [-4, 38, -4, 4, 46, 4], pivot: [0, 38, 0], role: 'head' },
    { id: 'armL', box: [-6, 12, -1, -4, 38, 1], pivot: [-5, 37, 0], uv: 'arm', role: 'armL' },
    { id: 'armR', box: [4, 12, -1, 6, 38, 1], pivot: [5, 37, 0], uv: 'arm', role: 'armR' },
    { id: 'legL', box: [-3, 0, -1, -1, 26, 1], pivot: [-2, 26, 0], uv: 'leg', role: 'legA' },
    { id: 'legR', box: [1, 0, -1, 3, 26, 1], pivot: [2, 26, 0], uv: 'leg', role: 'legB' },
  ],
  warden: [
    { id: 'body', box: [-8, 16, -5, 8, 36, 5] },
    { id: 'head', box: [-8, 36, -6, 8, 48, 6], pivot: [0, 36, 0], role: 'head' },
    { id: 'earL', box: [-12, 40, -1, -8, 46, 1], parent: 'head', uv: 'ear' },
    { id: 'earR', box: [8, 40, -1, 12, 46, 1], parent: 'head', uv: 'ear' },
    { id: 'armL', box: [-12, 12, -3, -8, 34, 3], pivot: [-10, 33, 0], uv: 'arm', role: 'armL' },
    { id: 'armR', box: [8, 12, -3, 12, 34, 3], pivot: [10, 33, 0], uv: 'arm', role: 'armR' },
    { id: 'legL', box: [-6, 0, -3, -2, 16, 3], pivot: [-4, 16, 0], uv: 'leg', role: 'legA' },
    { id: 'legR', box: [2, 0, -3, 6, 16, 3], pivot: [4, 16, 0], uv: 'leg', role: 'legB' },
  ],
});
// skins for the new creatures, painted into the model atlas after the originals
{
  const paint0 = paintSkins;
  // eslint-disable-next-line no-global-assign
  paintSkins = function () {
    const cv = paint0();
    const g = cv.getContext('2d');
    const img = g.getImageData(0, 0, ATLAS_W, ATLAS_H), D = img.data;
    const rng = mulberry32(4242);
    const px = (x, y, c, f = 1) => { const i = (y * ATLAS_W + x) * 4; D[i] = clamp(c[0] * f, 0, 255); D[i + 1] = clamp(c[1] * f, 0, 255); D[i + 2] = clamp(c[2] * f, 0, 255); D[i + 3] = 255; };
    const rect = (r, fn) => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) { const c = fn(x, y, r[2], r[3]); if (c) px(r[0] + x, r[1] + y, c[0], c[1]); } };
    const faces = (type, id) => MOB_MODELS[type].find((p) => p.id === id || p.uv === id).faces;
    const all = (f, fn) => { for (const k of ['top', 'bottom', 'left', 'front', 'right', 'back']) rect(f[k], fn); };
    // ember cube: dark crust with glowing cracks and two orange eyes
    all(faces('ember', 'body'), (x, y) => [((x * 3 + y * 5) % 7 === 0 || (x + y * 2) % 11 === 0) ? [255, 150, 40] : [70, 30, 24], 0.85 + rng() * 0.2]);
    { const f = faces('ember', 'body').front; for (const ex of [4, 10]) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) px(f[0] + ex + i, f[1] + 5 + j, [255, 220, 90]); }
    // cinder wraith: a golden head with a dark visor, glowing rods
    all(faces('wraith', 'head'), () => [[236, 180, 60], 0.85 + rng() * 0.2]);
    { const f = faces('wraith', 'head').front; for (let x = 1; x < 7; x++) { px(f[0] + x, f[1] + 3, [40, 20, 10]); if (x === 2 || x === 5) px(f[0] + x, f[1] + 3, [255, 250, 200]); } }
    all(faces('wraith', 'rod'), (x, y) => [y % 3 === 0 ? [255, 220, 110] : [230, 140, 40], 0.9 + rng() * 0.15]);
    // voidwalker: near-black with purple eyes
    for (const id of ['body', 'head', 'arm', 'leg']) all(faces('voidwalker', id), () => [[22, 16, 30], 0.85 + rng() * 0.25]);
    { const f = faces('voidwalker', 'head').front; for (const ex of [0, 5]) for (let i = 0; i < 3; i++) px(f[0] + ex + i, f[1] + 4, i === 1 ? [255, 180, 255] : [200, 60, 230]); }
    // warden: deep teal hide, bone-white ribs with glowing souls in the chest, antler-like ears
    const hide = [18, 56, 66];
    for (const id of ['arm', 'leg']) all(faces('warden', id), () => [hide, 0.8 + rng() * 0.25]);
    all(faces('warden', 'body'), () => [hide, 0.8 + rng() * 0.25]);
    {
      const f = faces('warden', 'body').front;
      rect(f, (x, y, w, h) => {
        if (y > 2 && y < 14 && x > 3 && x < w - 4) return (y % 3 === 0) ? [226, 220, 200] : [60, 230, 230];
        return null;
      });
    }
    all(faces('warden', 'head'), () => [hide, 0.8 + rng() * 0.2]);
    { const f = faces('warden', 'head').front; for (let y = 6; y < 11; y++) for (let x = 3; x < 13; x++) px(f[0] + x, f[1] + y, (x + y) % 3 ? [30, 20, 24] : [230, 226, 210]); }
    all(faces('warden', 'ear'), () => [[60, 230, 230], 0.8 + rng() * 0.3]);
    g.putImageData(img, 0, 0);
    return cv;
  };
}
Object.assign(SYNTH, {
  ember_say(ctx, o, t, p) { Sound.noise(ctx, o, t, 0.25, { type: 'lowpass', freq: 500 * p, q: 2, gain: 0.35 }); },
  ember_hurt(ctx, o, t, p) { Sound.noise(ctx, o, t, 0.3, { type: 'bandpass', freq: 700 * p, q: 3, gain: 0.45 }); },
  ember_death(ctx, o, t, p) { Sound.noise(ctx, o, t, 0.7, { type: 'lowpass', freq: 900 * p, freqEnd: 200, q: 2, gain: 0.45 }); },
  wraith_say(ctx, o, t, p) { Sound.noise(ctx, o, t, 1.0, { type: 'bandpass', freq: 400 * p, freqEnd: 900, q: 1.5, gain: 0.3, attack: 0.3 }); },
  wraith_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.3, { wave: 'square', f0: 260 * p, f1: 180 * p, filter: ['lowpass', 900, 2], gain: 0.3 }); },
  wraith_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.9, { wave: 'square', f0: 240 * p, f1: 60 * p, filter: ['lowpass', 800, 2], gain: 0.3 }); },
  fireball(ctx, o, t) { Sound.noise(ctx, o, t, 0.6, { type: 'lowpass', freq: 600, freqEnd: 200, q: 1, gain: 0.4 }); },
  voidwalker_say(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.8, { wave: 'sine', f0: 180 * p, f1: 120 * p, am: 9, gain: 0.3 }); },
  voidwalker_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.4, { wave: 'sawtooth', f0: 420 * p, f1: 220 * p, filter: ['bandpass', 900, 3], gain: 0.35 }); },
  voidwalker_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 1.4, { wave: 'sawtooth', f0: 300 * p, f1: 40 * p, am: 14, filter: ['lowpass', 1200, 2], gain: 0.35 }); },
  vw_scream(ctx, o, t) { Sound.tone(ctx, o, t, 1.2, { wave: 'sawtooth', f0: 900, f1: 500, am: 30, filter: ['bandpass', 1500, 2], gain: 0.3 }); },
  teleport(ctx, o, t) { Sound.tone(ctx, o, t, 0.35, { wave: 'sine', f0: 900, f1: 200, gain: 0.3 }); },
  warden_say(ctx, o, t, p) { Sound.tone(ctx, o, t, 1.4, { wave: 'sawtooth', f0: 60 * p, f1: 48 * p, am: 6, filter: ['lowpass', 300, 3], gain: 0.6 }); },
  warden_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.6, { wave: 'sawtooth', f0: 90 * p, f1: 60 * p, filter: ['lowpass', 500, 3], gain: 0.6 }); },
  warden_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 2.5, { wave: 'sawtooth', f0: 80 * p, f1: 25 * p, am: 4, filter: ['lowpass', 400, 3], gain: 0.7 }); },
  heartbeat(ctx, o, t) { Sound.tone(ctx, o, t, 0.12, { wave: 'sine', f0: 55, f1: 40, gain: 0.7 }); Sound.tone(ctx, o, t + 0.22, 0.12, { wave: 'sine', f0: 50, f1: 38, gain: 0.55 }); },
  sonic_charge(ctx, o, t) { Sound.tone(ctx, o, t, 1.3, { wave: 'sawtooth', f0: 80, f1: 400, filter: ['lowpass', 1200, 4], gain: 0.4 }); },
  sonic_boom(ctx, o, t) { Sound.noise(ctx, o, t, 1.0, { type: 'lowpass', freq: 1500, freqEnd: 100, q: 2, gain: 0.8 }); Sound.tone(ctx, o, t, 0.6, { wave: 'sine', f0: 120, f1: 40, gain: 0.7 }); },
  shriek(ctx, o, t) { Sound.tone(ctx, o, t, 1.6, { wave: 'sawtooth', f0: 1200, f1: 700, am: 22, filter: ['bandpass', 1600, 2], gain: 0.35, attack: 0.2 }); },
  sensor(ctx, o, t) { Sound.noise(ctx, o, t, 0.3, { type: 'bandpass', freq: 2600, freqEnd: 1200, q: 6, gain: 0.3 }); },
  emerge(ctx, o, t) { Sound.noise(ctx, o, t, 3.0, { type: 'lowpass', freq: 250, freqEnd: 600, q: 2, gain: 0.7, attack: 0.5 }); },
});

const DimMobs = {
  darkness: 0, noises: [], bolts: [], warn: 0, shriekCd: 0, sensorCd: 0, stepT: 0, beatT: 0,

  noise(pos, loud) { this.noises.push({ pos, loud, t: G.time }); if (this.noises.length > 20) this.noises.shift(); },

  // shared helpers
  begin(m, dt) {
    m.age += dt; m.hurtTime = Math.max(0, m.hurtTime - dt); m.invuln -= dt; m.ai.attackCd -= dt;
    if (m.def.fireproof) m.fire = 0;
  },
  move(m, dt, mx, mz, speed, jump) {
    if (mx || mz) {
      let d = Math.atan2(mx, mz) - m.bodyYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.bodyYaw += d * Math.min(1, dt * 8);
    }
    if (m.collidedH && (mx || mz) && m.onGround) jump = true;
    m.physics(dt, mx * speed, mz * speed, jump, speed);
    const hs = Math.hypot(m.vel[0], m.vel[2]);
    m.walkAmt += (Math.min(1, hs / 2.5) - m.walkAmt) * Math.min(1, dt * 10);
    m.walkPhase += dt * hs * 3.2;
  },
  env(m, dt) {
    m.envTick -= dt;
    if (m.envTick > 0) return;
    m.envTick = 0.5;
    const w = G.world, bx = Math.floor(m.pos[0]), by = Math.floor(m.pos[1] + 0.3), bz = Math.floor(m.pos[2]);
    const feet = w.getBlock(bx, by, bz);
    if (feet === B.LAVA && !m.def.fireproof) { m.fire = 8; m.damage(4, { fire: true, env: true }); }
    if (feet === B.WATER && m.type === 'voidwalker') { m.damage(1, { env: true }); this.blink(m, 12); }
    if (m.fire > 0 && !m.def.fireproof) m.damage(1, { fire: true, env: true });
    if (m.pos[1] < -20) m.damage(1000, { env: true });
  },
  wander(m, dt, range) {
    const ai = m.ai;
    ai.timer -= dt;
    if (ai.timer <= 0) {
      if (ai.state === 'walk' || Math.random() < 0.4) { ai.state = 'idle'; ai.timer = rand(2, 5); }
      else { ai.state = 'walk'; ai.timer = rand(3, 7); m.pickTarget(range, null); }
    }
    if (ai.state !== 'walk') return [0, 0];
    const tx = ai.tx - m.pos[0], tz = ai.tz - m.pos[2], l = Math.hypot(tx, tz);
    if (l < 0.8) { ai.state = 'idle'; ai.timer = rand(2, 4); return [0, 0]; }
    return [tx / l * 0.6, tz / l * 0.6];
  },
  survivalTarget() { return G.mode === 'survival' && !G.stats.dead && G.difficulty > 0; },
  melee(m, dist, dy) {
    const reach = m.hw + PLAYER_HALF_W + (m.type === 'warden' ? 1.1 : 0.6);
    if (dist < reach && dy > -m.h && dy < 2 && m.ai.attackCd <= 0) {
      m.ai.attackCd = m.type === 'warden' ? 1.6 : 1.0;
      const dmg = m.def.dmg[Math.max(0, G.difficulty - 1)] || m.def.dmg[1];
      G.stats.damage(dmg, { type: 'mob', mob: m, from: m.pos });
      if (m.type === 'warden') { const p = G.player, l = dist || 1; p.vel[0] += (p.pos[0] - m.pos[0]) / l * 9; p.vel[2] += (p.pos[2] - m.pos[2]) / l * 9; p.vel[1] = 5; }
      if (m.type === 'ember') G.stats.fire = Math.max(G.stats.fire || 0, 2);
      return true;
    }
    return false;
  },
  // teleport a voidwalker to a free spot nearby (or near the player)
  blink(m, range, near) {
    const w = G.world, c = near || m.pos;
    for (let k = 0; k < 16; k++) {
      const x = Math.floor(c[0] + rand(-range, range)), z = Math.floor(c[2] + rand(-range, range));
      for (let y = Math.floor(c[1]) + 6; y > Math.floor(c[1]) - 8; y--) {
        if (BLOCK_OPAQUE[w.getBlock(x, y - 1, z)] && !BLOCK_SOLID[w.getBlock(x, y, z)] && !BLOCK_SOLID[w.getBlock(x, y + 1, z)] && !BLOCK_SOLID[w.getBlock(x, y + 2, z)] && !IS_LIQUID(w.getBlock(x, y, z))) {
          this.puff(m.pos, [0.6, 0.2, 0.9]);
          m.pos = [x + 0.5, y, z + 0.5]; m.vel = [0, 0, 0];
          this.puff(m.pos, [0.6, 0.2, 0.9]);
          sfx('teleport', m.pos, 1, rand(0.9, 1.1));
          return true;
        }
      }
    }
    return false;
  },
  puff(pos, rgb) {
    for (let i = 0; i < 18; i++) Particles.add(Particles.base(pos[0] + rand(-0.4, 0.4), pos[1] + rand(0, 2.6), pos[2] + rand(-0.4, 0.4), {
      vx: rand(-1, 1), vy: rand(-0.5, 1), vz: rand(-1, 1), life: 0.9, max: 0.9, size: 0.07, layer: T.p_crit, r: rgb[0], g: rgb[1], b: rgb[2], glow: true, collide: false }));
  },

  ember(m, dt) {
    this.begin(m, dt);
    const p = G.player, dx = p.pos[0] - m.pos[0], dz = p.pos[2] - m.pos[2], dy = p.pos[1] - m.pos[1], hd = Math.hypot(dx, dz) || 1;
    if (!this.survivalTarget()) m.ai.target = null;
    else if (!m.ai.target && hd < 16 && m.canSee(p)) m.ai.target = p;
    else if (m.ai.target && hd > 28) m.ai.target = null;
    let mx = 0, mz = 0, jump = false;
    // it moves in hops
    m.ai.hop = (m.ai.hop || 0) - dt;
    if (m.onGround && m.ai.hop <= 0) {
      m.ai.hop = rand(0.8, 1.6);
      if (m.ai.target) { mx = dx / hd; mz = dz / hd; } else { [mx, mz] = this.wander(m, 1, 6); if (!mx && !mz && Math.random() < 0.5) { const a = Math.random() * 6.28; mx = Math.cos(a); mz = Math.sin(a); } }
      if (mx || mz) { jump = true; m.vel[0] = mx * 4.5; m.vel[2] = mz * 4.5; m.bodyYaw = Math.atan2(mx, mz); sfx('ember_say', m.pos, 0.5, rand(0.8, 1.2)); }
    }
    if (m.ai.target) { m.headYaw = Math.atan2(dx, dz); this.melee(m, Math.hypot(dx, dy, dz), dy); }
    m.physics(dt, 0, 0, jump, 0);
    if (!m.onGround) { m.vel[0] *= 1; }
    if (jump) m.vel[1] = 7.5;
    this.env(m, dt);
  },

  wraith(m, dt) {
    this.begin(m, dt);
    const w = G.world, p = G.player;
    const dx = p.pos[0] - m.pos[0], dz = p.pos[2] - m.pos[2], dy = p.pos[1] - m.pos[1], hd = Math.hypot(dx, dz) || 1;
    if (!this.survivalTarget()) m.ai.target = null;
    else if (!m.ai.target && hd < 20 && m.canSee(p)) m.ai.target = p;
    else if (m.ai.target && hd > 32) m.ai.target = null;
    // float a few blocks over the ground
    let floor = Math.floor(m.pos[1]);
    while (floor > m.pos[1] - 8 && !BLOCK_SOLID[w.getBlock(Math.floor(m.pos[0]), floor - 1, Math.floor(m.pos[2]))]) floor--;
    const want = (m.ai.target ? Math.max(floor + 2.5, p.pos[1] + 1.5) : floor + 2) + Math.sin(m.age * 1.7) * 0.4;
    m.vel[1] = (want - m.pos[1]) * 2 + GRAVITY * dt;
    let mx = 0, mz = 0;
    if (m.ai.target) {
      m.headYaw = Math.atan2(dx, dz); m.bodyYaw = m.headYaw;
      const k = hd > 10 ? 1 : hd < 5 ? -1 : 0;
      mx = dx / hd * k; mz = dz / hd * k;
      m.ai.shootCd -= dt;
      if (m.ai.shootCd <= 0 && hd < 18) {
        m.ai.burst = (m.ai.burst || 0) + 1;
        m.ai.shootCd = m.ai.burst % 3 === 0 ? rand(2.5, 3.5) : 0.35;
        if (m.canSee(p)) this.fireball(m, p);
      }
    } else [mx, mz] = this.wander(m, dt, 8);
    this.move(m, dt, mx, mz, m.def.speed, false);
    m.fallStart = null;
    if (Math.random() < dt * 8) Particles.flame(m.pos[0] + rand(-0.4, 0.4), m.pos[1] + rand(0.2, 1.4), m.pos[2] + rand(-0.4, 0.4));
    this.env(m, dt);
  },
  fireball(m, p) {
    const e = [m.pos[0], m.pos[1] + 1.5, m.pos[2]], t = p.eyePos();
    const d = [t[0] - e[0], t[1] - 0.4 - e[1], t[2] - e[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    const sp = 13, sp2 = 0.08;
    this.bolts.push({ pos: e, vel: [d[0] / l * sp + rand(-1, 1) * sp2 * sp, d[1] / l * sp, d[2] / l * sp + rand(-1, 1) * sp2 * sp], life: 3, from: m });
    sfx('fireball', m.pos, 0.9, rand(0.9, 1.2));
  },
  updateBolts(dt) {
    const w = G.world, p = G.player;
    for (const b of this.bolts) {
      b.life -= dt;
      for (let s = 0; s < 3; s++) {
        for (let k = 0; k < 3; k++) b.pos[k] += b.vel[k] * dt / 3;
        const bx = Math.floor(b.pos[0]), by = Math.floor(b.pos[1]), bz = Math.floor(b.pos[2]);
        if (BLOCK_SOLID[w.getBlock(bx, by, bz)]) { b.life = 0; Particles.smoke(b.pos[0], b.pos[1], b.pos[2], 4, 0.2, true); break; }
        const c = [p.pos[0], p.pos[1] + 0.9, p.pos[2]];
        if (Math.hypot(b.pos[0] - c[0], (b.pos[1] - c[1]) * 0.6, b.pos[2] - c[2]) < 0.8 && G.mode === 'survival') {
          b.life = 0;
          G.stats.damage(4 + G.difficulty, { type: 'mob', mob: b.from, from: b.pos });
          if (!hasEffect('fire_res')) G.stats.fire = Math.max(G.stats.fire || 0, 4);
          break;
        }
      }
      Particles.flame(b.pos[0], b.pos[1], b.pos[2]);
      Particles.flame(b.pos[0] + rand(-0.15, 0.15), b.pos[1] + rand(-0.15, 0.15), b.pos[2] + rand(-0.15, 0.15));
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  },

  voidwalker(m, dt) {
    this.begin(m, dt);
    const p = G.player;
    const dx = p.pos[0] - m.pos[0], dz = p.pos[2] - m.pos[2], dy = p.pos[1] - m.pos[1], hd = Math.hypot(dx, dz) || 1;
    const ai = m.ai;
    if (!this.survivalTarget()) ai.target = null;
    // neutral until stared at (or hit): looking at its head provokes it
    if (!ai.target && this.survivalTarget() && hd < 32) {
      const e = p.eyePos(), hx = m.pos[0] - e[0], hy = m.pos[1] + m.h - 0.3 - e[1], hz = m.pos[2] - e[2], hl = Math.hypot(hx, hy, hz) || 1;
      const f = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
      if ((f[0] * hx + f[1] * hy + f[2] * hz) / hl > 0.985 && m.canSee(p)) { ai.target = p; sfx('vw_scream', m.pos, 1, 1); ai.blinkT = 1; }
    }
    if (ai.target && hd > 40) ai.target = null;
    let mx = 0, mz = 0;
    if (ai.target) {
      m.headYaw = Math.atan2(dx, dz);
      mx = dx / hd; mz = dz / hd;
      ai.blinkT = (ai.blinkT || 3) - dt;
      if (ai.blinkT <= 0) { ai.blinkT = rand(3, 6); if (hd > 6) this.blink(m, 3, p.pos); }
      this.melee(m, Math.hypot(dx, dy, dz), dy);
    } else {
      [mx, mz] = this.wander(m, dt, 10);
      if (Math.random() < dt * 0.02) this.blink(m, 16);
    }
    this.move(m, dt, mx, mz, m.def.speed * (ai.target ? 1.2 : 0.7), false);
    if (Math.random() < dt * 3) this.puff([m.pos[0], m.pos[1] + rand(0, 2), m.pos[2]], [0.5, 0.1, 0.7]);
    this.env(m, dt);
  },

  // The Warden is blind: it follows noises (footsteps, blocks broken or placed, sensors) and
  // smells players that come close. Angry, it roars a sonic boom through anything in its way.
  warden(m, dt) {
    this.begin(m, dt);
    const ai = m.ai, p = G.player;
    if (ai.emerge > 0) {
      ai.emerge -= dt;
      m.invuln = 0.5;
      if (Math.random() < dt * 20) Particles.blockBreak(m.pos[0] - 0.5, m.pos[1] - 1, m.pos[2] - 0.5, B.SCULK);
      m.physics(dt, 0, 0, false, 0);
      return;
    }
    const dx = p.pos[0] - m.pos[0], dz = p.pos[2] - m.pos[2], dy = p.pos[1] - m.pos[1], hd = Math.hypot(dx, dz) || 1, dist = Math.hypot(dx, dy, dz);
    const alive = this.survivalTarget();
    // senses
    if (alive && dist < 4) { ai.goal = p.pos.slice(); ai.anger = Math.min(1, (ai.anger || 0) + dt * 0.8); ai.quiet = 0; }
    for (const n of this.noises) {
      if (n.used === m || G.time - n.t > 1.5) continue;
      const d = Math.hypot(n.pos[0] - m.pos[0], n.pos[2] - m.pos[2]);
      if (d < 22) { n.used = m; ai.goal = n.pos.slice(); ai.anger = Math.min(1, (ai.anger || 0) + 0.2 * n.loud); ai.quiet = 0; sfx('sensor', m.pos, 0.6, 0.6); }
    }
    ai.quiet = (ai.quiet || 0) + dt;
    ai.anger = Math.max(0, (ai.anger || 0) - dt * 0.02);
    let mx = 0, mz = 0, speed = m.def.speed;
    if (ai.goal) {
      const gx = ai.goal[0] - m.pos[0], gz = ai.goal[2] - m.pos[2], gl = Math.hypot(gx, gz);
      if (gl > 1.2) { mx = gx / gl; mz = gz / gl; m.headYaw = Math.atan2(gx, gz); }
      else ai.goal = null;
      speed *= ai.anger > 0.5 ? 1.8 : 1.2;
    } else [mx, mz] = this.wander(m, dt, 8);
    if (alive && ai.anger > 0.5 && dist < 20) {
      this.melee(m, dist, dy);
      // sonic boom at range
      ai.boomCd = (ai.boomCd || 4) - dt;
      if (ai.charge > 0) {
        ai.charge -= dt; mx = 0; mz = 0; m.headYaw = Math.atan2(dx, dz); m.bodyYaw = m.headYaw;
        if (ai.charge <= 0) this.sonicBoom(m, p);
      } else if (ai.boomCd <= 0 && dist > 5 && dist < 16) { ai.charge = 1.4; ai.boomCd = 6; sfx('sonic_charge', m.pos, 1, 1); }
    }
    this.move(m, dt, mx, mz, speed, false);
    m.soundT -= dt;
    if (m.soundT <= 0) { m.soundT = ai.anger > 0.5 ? rand(1.5, 3) : rand(5, 10); sfx('warden_say', m.pos, 1, rand(0.9, 1.1)); }
    // after a long silence it digs back into the ground
    if (ai.quiet > 60) { m.removed = true; this.puff(m.pos, [0.1, 0.5, 0.6]); sfx('emerge', m.pos, 0.8, 1.3); }
    this.env(m, dt);
  },
  sonicBoom(m, p) {
    const e = [m.pos[0], m.pos[1] + 2.2, m.pos[2]], t = p.eyePos();
    const d = [t[0] - e[0], t[1] - e[1], t[2] - e[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    for (let s = 1; s < l; s += 0.6) {
      Particles.add(Particles.base(e[0] + d[0] / l * s, e[1] + d[1] / l * s, e[2] + d[2] / l * s, {
        life: 0.6, max: 0.6, size: 0.35, layer: T.p_bubble, r: 0.4, g: 1, b: 1, glow: true, collide: false, drag: 1 }));
    }
    sfx('sonic_boom', m.pos, 1.2, 1);
    if (G.mode === 'survival') {
      G.stats.damage(10, { type: 'magic', from: m.pos });
      p.vel[0] += d[0] / l * 12; p.vel[2] += d[2] / l * 12; p.vel[1] = 6;
    }
    G.shake = Math.max(G.shake || 0, 0.8);
  },

  // Deep Dark: footsteps are noise, shriekers call the Warden, the darkness pulses when it is near.
  update(dt) {
    const p = G.player;
    if (!p || G.onTitle) return;
    this.updateBolts(dt);
    const dim = dimOf(p.pos[0], p.pos[2]);
    let warden = null;
    for (const m of Ents.mobs) if (m.type === 'warden' && !m.dead && Math.hypot(m.pos[0] - p.pos[0], m.pos[2] - p.pos[2]) < 48) warden = m;
    const want = warden ? 0.55 + 0.45 * Math.sin(G.time * 1.3) : 0;
    this.darkness += (want - this.darkness) * Math.min(1, dt * 1.5);
    if (warden) { this.beatT -= dt; if (this.beatT <= 0) { this.beatT = warden.ai.anger > 0.5 ? 0.7 : 1.3; sfx('heartbeat', warden.pos, 1, 1); } }
    if (dim !== DIM_DEEP || G.stats.dead) { this.warn = Math.max(0, this.warn - dt / 300); return; }
    this.shriekCd -= dt; this.sensorCd -= dt;
    const moving = Math.hypot(p.vel[0], p.vel[2]) > 1 && p.onGround;
    this.stepT -= dt;
    if (moving && !p.sneaking && this.stepT <= 0) {
      this.stepT = 0.45;
      this.noise(p.pos.slice(), p.sprinting ? 1 : 0.5);
      // nearby sculk hears it
      const w = G.world, bx = Math.floor(p.pos[0]), by = Math.floor(p.pos[1]), bz = Math.floor(p.pos[2]);
      let shrieker = null, sensor = null;
      for (let y = by - 3; y <= by + 2; y++) for (let z = bz - 7; z <= bz + 7; z++) for (let x = bx - 7; x <= bx + 7; x++) {
        const id = w.getBlock(x, y, z);
        if (id === B.SCULK_SHRIEKER && !shrieker) shrieker = [x + 0.5, y + 1, z + 0.5];
        else if (id === B.SCULK_SENSOR && !sensor) sensor = [x + 0.5, y + 1, z + 0.5];
      }
      if (sensor && this.sensorCd <= 0) { this.sensorCd = 1.2; sfx('sensor', sensor, 0.8, 1); this.noise(sensor, 1); }
      if (shrieker && this.shriekCd <= 0 && G.mode === 'survival') {
        this.shriekCd = 10;
        this.warn++;
        sfx('shriek', shrieker, 1, 1);
        this.puff(shrieker, [0.3, 0.9, 1]);
        G.ui.toast(['🔔 A sculk shrieker cries out…', '🔔 Something below is stirring…', '💀 The Warden is coming'][Math.min(2, this.warn - 1)]);
        if (this.warn >= 3 && !warden) { this.summonWarden(shrieker); this.warn = 0; }
      }
    }
  },
  summonWarden(near) {
    const w = G.world, p = G.player;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2, d = rand(5, 10);
      const x = Math.floor(near[0] + Math.cos(a) * d), z = Math.floor(near[2] + Math.sin(a) * d);
      for (let y = Math.floor(p.pos[1]) + 4; y > Math.floor(p.pos[1]) - 6; y--) {
        if (!BLOCK_OPAQUE[w.getBlock(x, y - 1, z)]) continue;
        let room = true;
        for (let j = 0; j < 3; j++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) if (BLOCK_SOLID[w.getBlock(x + ox, y + j, z + oz)]) room = false;
        if (!room) continue;
        const m = Ents.spawnMob('warden', x + 0.5, y, z + 0.5);
        if (m) { m.ai.emerge = 3; m.ai.anger = 0.3; m.ai.goal = p.pos.slice(); sfx('emerge', m.pos, 1.2, 1); }
        return m;
      }
    }
    return null;
  },
};
{
  const up0 = Mob.prototype.update;
  Mob.prototype.update = function (dt) {
    const c = this.def.custom;
    if (!c || this.remote || this.dead) return up0.call(this, dt);
    return DimMobs[c](this, dt);
  };
  // in cave dimensions the "surface" is the ceiling: walk targets look for a floor near the mob
  const pick0 = Mob.prototype.pickTarget;
  Mob.prototype.pickTarget = function (range, awayFrom) {
    if (!dimOf(this.pos[0], this.pos[2])) return pick0.call(this, range, awayFrom);
    const w = G.world;
    for (let tries = 0; tries < 8; tries++) {
      let a = Math.random() * Math.PI * 2;
      if (awayFrom) a = Math.atan2(this.pos[2] - awayFrom[2], this.pos[0] - awayFrom[0]) + rand(-0.8, 0.8);
      const d = rand(range * 0.4, range);
      const tx = this.pos[0] + Math.cos(a) * d, tz = this.pos[2] + Math.sin(a) * d;
      for (let y = Math.floor(this.pos[1]) + 2; y > Math.floor(this.pos[1]) - 4; y--) {
        const below = w.getBlock(Math.floor(tx), y - 1, Math.floor(tz)), here = w.getBlock(Math.floor(tx), y, Math.floor(tz));
        if (BLOCK_SOLID[below] && !BLOCK_SOLID[here] && !IS_LIQUID(here) && !IS_LIQUID(below)) { this.ai.tx = tx; this.ai.tz = tz; return true; }
      }
    }
    this.ai.tx = this.pos[0]; this.ai.tz = this.pos[2];
    return false;
  };
  // creatures of each dimension
  const spawn0 = Ents.spawn;
  Ents.spawn = function (dt) {
    const p = G.player, dim = dimOf(p.pos[0], p.pos[2]);
    if (!dim) return spawn0.call(this, dt);
    if (!G.rules.mobSpawning || dim === DIM_DEEP) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || G.difficulty === 0) return;
    this.spawnTimer = 1.5;
    let n = 0;
    for (const m of this.mobs) if (m.def.hostile && !m.dead) n++;
    if (n >= (dim === DIM_END ? 8 : 12)) return;
    const w = G.world;
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2, d = rand(16, 40);
      const x = Math.floor(p.pos[0] + Math.cos(a) * d), z = Math.floor(p.pos[2] + Math.sin(a) * d);
      const c = w.getChunk(x >> 4, z >> 4);
      if (!c || !c.light) continue;
      const y0 = Math.floor(p.pos[1] + rand(-14, 14));
      let y = -1;
      for (let yy = Math.min(CH - 4, y0 + 8); yy > Math.max(2, y0 - 16); yy--) {
        const below = w.getBlock(x, yy - 1, z);
        if (!BLOCK_OPAQUE[below] || below === B.BEDROCK) continue;
        if (BLOCK_SOLID[w.getBlock(x, yy, z)] || BLOCK_SOLID[w.getBlock(x, yy + 1, z)] || BLOCK_SOLID[w.getBlock(x, yy + 2, z)]) continue;
        if (IS_LIQUID(w.getBlock(x, yy, z))) continue;
        y = yy; break;
      }
      if (y < 0 || (w.getLight(x, y, z) & 15) > 11) continue;
      let type = 'voidwalker';
      if (dim === DIM_NETHER) {
        const r = Math.random();
        type = r < 0.38 ? 'ember' : r < 0.58 ? 'wraith' : r < 0.84 ? 'zombie' : 'skeleton';
      }
      this.spawnMob(type, x + 0.5, y, z + 0.5);
      return;
    }
  };
}
