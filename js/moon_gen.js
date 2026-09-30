'use strict';
// The Moon and the spaceport. Deterministic, loaded in the chunk workers too (data-w).
// - The Moon is a band of the same world like the other dimensions (z <= -150 000, local
//   z = z + 200 000, DIM_MOON in dimensions.js): grey regolith (calcite over tuff and andesite)
//   with rolling hills, craters with raised rims, boulders and bedrock. In the middle (local 0, 0)
//   the Moon base: a landing pad, three glass domes joined by corridors — the living quarters,
//   the lab and the greenhouse — solar panel fields and a radio mast.
// - The spaceport on Earth, south of the district: a levelled apron, the launch pad with its
//   flame trench and service tower, a control building with ticket machines and a lit path back
//   to the district. rocket.js flies the rocket between the two pads.

const MOON_BASE_Y = 64;

// ---------------------------------------------------------------- the Moon ----
function moonHeight(g, lx, lz) {
  const N = dimNoise(g);
  let h = MOON_BASE_Y + N.a.fbm2(lx * 0.006, lz * 0.006, 4) * 14 + N.b.fbm2(lx * 0.03, lz * 0.03, 2) * 2.5;
  // craters: at most one per 56-block cell
  const ci = Math.floor(lx / 56), cj = Math.floor(lz / 56);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = ci + di, j = cj + dj;
    if (hash3(i, 3, j, g.seed + 401) > 0.55) continue;
    const cx = i * 56 + 10 + hash3(i, 4, j, g.seed + 402) * 36, cz = j * 56 + 10 + hash3(i, 5, j, g.seed + 403) * 36;
    const r = 7 + hash3(i, 6, j, g.seed + 404) * 20, d = Math.hypot(lx - cx, lz - cz) / r;
    if (d < 1) h -= (1 - d * d) * r * 0.42;
    else if (d < 1.5) h += Math.sin((d - 1) / 0.5 * Math.PI) * r * 0.12;
  }
  // the base sits on flat ground
  const base = Math.hypot(lx, lz);
  if (base < 70) h = MOON_BASE_Y + (h - MOON_BASE_Y) * smoothstep(48, 70, base);
  return Math.floor(h);
}

function genMoon(g, chunk) {
  const b = chunk.blocks, ox = chunk.cx * CS, oz = chunk.cz * CS, loz = oz + DIM_C;
  const at = (x, y, z) => (y * CS + z) * CS + x;
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const lx = ox + x, lz = loz + z, h = Math.min(CH - 4, moonHeight(g, lx, lz));
    b[at(x, 0, z)] = B.BEDROCK;
    for (let y = 1; y <= h; y++) b[at(x, y, z)] = y > h - 2 ? B.CALCITE : y > h - 6 ? (hash3(lx, y, lz, 7) < 0.3 ? B.ANDESITE : B.TUFF) : y < 8 ? B.BASALT : B.STONE;
    // boulders
    const r = hash3(lx, 9, lz, g.seed + 405);
    if (r < 0.004 && Math.hypot(lx, lz) > 70) { b[at(x, h + 1, z)] = B.ANDESITE; if (r < 0.0015) b[at(x, h + 2, z)] = B.TUFF; }
  }
  const W = moonWriter(chunk);
  if (Math.abs(ox) < 90 && Math.abs(loz) < 90) buildMoonBase(g, W);
  dimFinish(chunk, WATER_STYLE.river);
}

// a writer in the Moon's local coordinates
function moonWriter(chunk) {
  const W = structWriter(chunk), dz = -DIM_C;
  return {
    x0: W.x0, x1: W.x1, z0: W.z0 + DIM_C, z1: W.z1 + DIM_C,
    set(x, y, z, id, f) { W.set(x, y, z + dz, id, f); },
    get(x, y, z) { return W.get(x, y, z + dz); },
    has(x, z) { return W.has(x, z + dz); },
    pic(x, y, z, f, w, h, builtin) { W.pic(x, y, z + dz, f, w, h, builtin); },
  };
}

// A dome of glass round (cx, cz) of radius R on the floor Y, with a terrazzo floor and a ring of lights.
function moonDome(W, cx, cz, R, Y, floor) {
  cityRect(W, cx - R, cz - R, cx + R, cz + R, (x, z) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d > R + 0.5) return;
    W.set(x, Y - 1, z, d > R - 0.5 ? B.POLISHED_ANDESITE : floor);
    for (let y = Y; y <= Y + R; y++) {
      const rr = Math.hypot(d, (y - Y) * 1.15);
      W.set(x, y, z, rr > R - 0.6 && rr <= R + 0.5 ? (y === Y ? B.POLISHED_ANDESITE : (Math.round(Math.atan2(z - cz, x - cx) * 8) % 4 === 0 && y < Y + R - 1 ? B.STEEL_PLATE : B.GLASS)) : rr <= R - 0.6 ? B.AIR : W.get(x, y, z));
    }
    if (d > R - 1.6 && d <= R - 0.6 && Math.round(Math.atan2(z - cz, x - cx) * 5) % 2 === 0) W.set(x, Y, z, B.SEA_LANTERN);
  });
}

function buildMoonBase(g, W) {
  const Y = MOON_BASE_Y + 1;
  // the landing pad at (0, 0): concrete with a yellow ring and lights
  cityRect(W, -9, -9, 9, 9, (x, z) => {
    const d = Math.hypot(x, z);
    W.set(x, Y - 1, z, d > 6 && d < 7.2 ? B.CONCRETE + 4 : (x === 0 || z === 0) && d < 3 ? B.CONCRETE + 4 : B.CONCRETE + 7);
    for (let y = Y; y < Y + 6; y++) W.set(x, y, z, B.AIR);
    if (Math.abs(x) === 9 && Math.abs(z) === 9) W.set(x, Y, z, B.SEA_LANTERN);
  });
  // three domes north of the pad, joined by glass corridors
  const domes = [[0, -34, 11, B.TERRAZZO, 'home'], [-26, -52, 8, B.CHECKER_TILE, 'lab'], [26, -52, 8, B.MOSS_BLOCK, 'garden']];
  // corridors: pad → main dome, main dome → the other two
  const corridor = (x0, z0, x1, z1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
      for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
        const px = x + a, pz = z + c;
        if (!W.has(px, pz)) continue;
        const edge = Math.max(Math.abs(a), Math.abs(c)) === 2;
        W.set(px, Y - 1, pz, B.POLISHED_ANDESITE);
        for (let y = Y; y <= Y + 3; y++) {
          const cur = W.get(px, y, pz);
          if (edge && cur !== B.AIR) { if (cur !== B.GLASS && cur !== B.STEEL_PLATE && cur !== B.POLISHED_ANDESITE) W.set(px, y, pz, y === Y + 3 ? B.STEEL_PLATE : B.GLASS); }
          else if (!edge) W.set(px, y, pz, y === Y + 3 ? (i % 6 === 0 ? B.GLASS_LAMP : B.GLASS) : B.AIR);
          else W.set(px, y, pz, y === Y + 3 ? B.STEEL_PLATE : B.GLASS);
        }
      }
    }
  };
  for (const [cx, cz, R, floor] of domes) moonDome(W, cx, cz, R, Y, floor);
  corridor(0, -10, 0, -23);
  corridor(-10, -40, -19, -47);
  corridor(10, -40, 19, -47);
  // the airlock doors at the pad end
  placeADoors(W, [[-1, -10], [0, -10], [1, -10]].filter(([x, z]) => W.has(x, z)), Y, 5);
  // the living dome: beds, sofas, a kitchen, a big window on the Earth
  const put = (x, y, z, id, f) => { if (W.has(x, z)) W.set(x, y, z, id, f); };
  for (const x of [-5, -4, -3]) put(x, Y, -37, B.SOFA_GRAY, 4);
  put(-4, Y, -35, B.COFFEE_TABLE, 0); put(-4, Y, -33, B.TV_ON, 5);
  for (const [x, id] of [[4, B.KITCHEN_COUNTER], [5, B.STOVE], [6, B.KITCHEN_SINK], [7, B.FRIDGE]]) put(x, Y, -40, id, 4);
  put(7, Y + 1, -40, B.FRIDGE_TOP, 4);
  for (const x of [3, 6]) { put(x, Y, -30, B.TABLE, 0); put(x, Y, -29, B.CHAIR, 5); put(x, Y, -31, B.CHAIR, 4); }
  for (const [x, z] of [[-8, -30], [8, -30]]) { put(x, Y, z, B.PODZOL); put(x, Y + 1, z, B.BUSH); }
  put(0, Y, -34, B.VENDING_MACHINE, 5);
  if (W.has(-2, -44)) W.pic(-2, Y + 2, -44, 4, 4, 2, 'moon_sign');
  // the lab: computers and boards
  for (const [x, z] of [[-29, -52], [-26, -55], [-23, -52], [-26, -49]]) { put(x, Y, z, B.TABLE, 0); put(x, Y + 1, z, B.DESKTOP_PC, 4); }
  put(-26, Y, -52, B.IRON_BLOCK); put(-26, Y + 1, -52, B.SEA_LANTERN);
  // the greenhouse: soil, crops, trees
  cityRect(W, 21, -57, 31, -47, (x, z) => {
    const d = Math.hypot(x - 26, z + 52);
    if (d > 6.5) return;
    if ((x + z) % 3 === 0) { W.set(x, Y - 1, z, B.FARMLAND); W.set(x, Y, z, B.WHEAT_CROP || B.AIR); }
    else if (d < 2) W.set(x, Y, z, B.BUSH);
  });
  campusTree(W, 26, Y, -52, 'cherry', 4);
  // solar panel fields east and west of the pad, a radio mast, a flag
  for (const sx of [-1, 1]) cityRect(W, sx > 0 ? 16 : -28, 4, sx > 0 ? 28 : -16, 16, (x, z) => {
    if ((z - 4) % 4 === 3) return;
    W.set(x, Y, z, B.IRON_BARS); W.set(x, Y + 1, z, B.SOLAR_PANEL);
  });
  for (let y = Y; y <= Y + 22; y++) put(34, y, -30, B.IRON_BARS);
  put(34, Y + 23, -30, B.LED_RED);
  for (let y = Y; y <= Y + 6; y++) put(12, y, -8, B.IRON_BARS);
}

// ---------------------------------------------------------------- the spaceport ----
function spacePort(g) {
  if (!g || !g.structs || typeof stucomVillage !== 'function') return null;
  if (g._space !== undefined) return g._space;
  const st = stucomVillage(g);
  if (!st || !st.district) { g._space = null; return null; }
  const D = st.district;
  g._space = { x: D.cx, z: D.cz + DOUT + 44, F: D.F, pathEnd: D.cz + DHALF + 14 };
  return g._space;
}
function spaceChunk(g, x0, z0) {
  const S = spacePort(g);
  if (!S) return null;
  if (x0 + CS - 1 < S.x - 34 || x0 > S.x + 34 || z0 + CS - 1 < S.pathEnd || z0 > S.z + 30) return null;
  return (W) => buildSpacePort(W, g, S);
}
function buildSpacePort(W, g, S) {
  const { x: X, z: Z, F } = S;
  // the apron: levelled, cleared
  cityRect(W, X - 30, Z - 26, X + 30, Z + 26, (x, z) => {
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y <= F - 2; y++) W.set(x, y, z, y >= F - 3 ? B.DIRT : B.STONE);
    const a = x - X, b = z - Z;
    W.set(x, F - 1, z, Math.abs(a) <= 10 && Math.abs(b) <= 10 ? B.CONCRETE + 7 : (a + b) % 9 === 0 ? B.POLISHED_ANDESITE : B.CONCRETE + 8);
    for (let y = F; y <= Math.max(h + 6, F + 48) && y < CH; y++) if (W.get(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
  });
  // the launch pad: a raised plinth with a yellow ring, the flame trench running south
  cityRect(W, X - 8, Z - 8, X + 8, Z + 8, (x, z) => {
    const a = x - X, b = z - Z, d = Math.hypot(a, b);
    W.set(x, F, z, d > 5.5 && d < 6.6 ? B.CONCRETE + 4 : B.CONCRETE + 7);
    if (d < 2.5) W.set(x, F, z, B.STEEL_PLATE);
    if (Math.abs(a) === 8 && Math.abs(b) === 8) W.set(x, F + 1, z, B.SEA_LANTERN);
  });
  cityRect(W, X - 2, Z + 9, X + 2, Z + 24, (x, z) => { for (let y = F - 5; y < F; y++) W.set(x, y, z, B.AIR); W.set(x, F - 6, z, B.BASALT); });
  // the service tower: a steel lattice to the west with arms to the rocket
  cityRect(W, X - 12, Z - 2, X - 10, Z + 2, (x, z) => {
    for (let y = F + 1; y <= F + 40; y++) {
      const edge = x === X - 12 || x === X - 10 || Math.abs(z - Z) === 2;
      W.set(x, y, z, edge ? ((y + x + z) % 4 === 0 ? B.STEEL_PLATE : B.IRON_BARS) : B.AIR);
    }
    W.set(x, F + 41, z, B.STEEL_PLATE);
  });
  for (const y of [F + 14, F + 26, F + 36]) cityRect(W, X - 9, Z - 1, X - 3, Z + 1, (x, z) => { W.set(x, y, z, B.STEEL_PLATE); if (z !== Z) W.set(x, y + 1, z, B.IRON_BARS); });
  if (W.has(X - 11, Z)) W.set(X - 11, F + 42, Z, B.LED_RED);
  // the control building to the north-east: glass, ticket machines, the big sign
  const bx0 = X + 14, bz0 = Z - 22, bx1 = X + 28, bz1 = Z - 12;
  cityRect(W, bx0, bz0, bx1, bz1, (x, z) => {
    const edge = x === bx0 || x === bx1 || z === bz0 || z === bz1;
    W.set(x, F - 1, z, B.TERRAZZO);
    for (let y = F; y <= F + 5; y++) W.set(x, y, z, y === F + 5 ? B.CONCRETE + 8 : edge ? ((x - bx0) % 4 === 0 || z === bz0 && x % 3 === 0 ? B.CONCRETE + 7 : B.GLASS) : B.AIR);
    if (!edge && z === bz0 + 1 && x % 3 === 0) W.set(x, F, z, B.VENDING_MACHINE, 4);
    if (!edge && z === bz1 - 2 && x > bx0 + 2 && x < bx1 - 2) { W.set(x, F, z, B.TABLE); W.set(x, F + 1, z, B.DESKTOP_PC, 5); }
  });
  placeADoors(W, [[bx0 + 6, bz1], [bx0 + 7, bz1], [bx0 + 8, bz1]].filter(([x, z]) => W.has(x, z)), F, 4);
  if (W.has(bx0 + 3, bz1 + 1)) W.pic(bx0 + 3, F + 3, bz1 + 1, 4, 8, 2, 'space_sign');
  // lamps round the apron and a path to the district
  cityRect(W, X - 30, Z - 26, X + 30, Z + 26, (x, z) => { const a = x - X, b = z - Z; if ((Math.abs(a) === 30 || Math.abs(b) === 26) && (a + b) % 12 === 0) campusLamp(W, x, F, z); });
  cityRect(W, X + 18, S.pathEnd, X + 22, Z - 27, (x, z) => {
    let y = F + 20;
    while (y > 2 && (W.get(x, y, z) <= 0 || !BLOCK_SOLID[W.get(x, y, z)] || BLOCK_RT[W.get(x, y, z)] === RT_CROSS || BLOCK_RT[W.get(x, y, z)] === RT_CUTOUT || AVE_LOGS.has(W.get(x, y, z)))) y--;
    W.set(x, y, z, x === X + 18 || x === X + 22 ? B.POLISHED_ANDESITE : B.PANOT);
    for (let yy = y + 1; yy <= y + 5; yy++) if (W.get(x, yy, z) > 0) W.set(x, yy, z, B.AIR);
    if (x === X + 22 && (z - Z) % 14 === 0) campusLamp(W, x, y + 1, z);
  });
}

{
  const gen0 = WorldGen.prototype.generate, h0 = WorldGen.prototype.height;
  WorldGen.prototype.generate = function (chunk) {
    if (this.type === 'default' && dimAt(chunk.cx * CS + 8, chunk.cz * CS + 8) === DIM_MOON) return genMoon(this, chunk);
    return gen0.call(this, chunk);
  };
  WorldGen.prototype.height = function (x, z) {
    if (this.type === 'default' && dimAt(x, z) === DIM_MOON) return moonHeight(this, x, z + DIM_C);
    return h0.call(this, x, z);
  };
}
