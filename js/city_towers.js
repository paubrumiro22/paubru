'use strict';
// Downtown Blockton (the CrazyGames edition, CG): a second ring of blocks round the district grid,
// with glass skyscrapers you can go up in (a lift in the core, lit offices at night, a roof with a
// helipad and a mast) and Eixample-style apartment blocks (shops on the ground floor, balconies,
// a garden in the courtyard). Deterministic, loaded in the chunk workers too (data-w).
//
// Coordinates: a block is 36 × 36 (a, b = 0..35 from its corner X0, Z0), the ground at F.

const TOWER_STYLES = [
  { frame: B.CONCRETE + 15, band: B.CONCRETE + 11, core: B.CONCRETE + 8, lobby: B.POLISHED_ANDESITE, crown: B.CONCRETE + 15 },  // blue glass
  { frame: B.QUARTZ_BLOCK, band: B.CONCRETE, core: B.CONCRETE + 8, lobby: B.MARBLE, crown: B.QUARTZ_BLOCK },                      // white
  { frame: B.CUT_COPPER, band: B.POLISHED_BLACKSTONE, core: B.CONCRETE + 7, lobby: B.POLISHED_BLACKSTONE, crown: B.CUT_COPPER },  // copper
  { frame: B.POLISHED_ANDESITE, band: B.SMOOTH_STONE, core: B.CONCRETE + 8, lobby: B.TERRAZZO, crown: B.STEEL_PLATE },            // stone
];
const EIX_WALLS = [B.TERRACOTTA_C + 2, B.SANDSTONE, B.BRICKS, B.QUARTZ_BRICKS, B.TERRACOTTA_C];
// the blocks of the ring and what goes in each (the airport takes the east side)
const CITY_RING = [
  [-2, -2, 'eixample'], [-1, -2, 'towers'], [0, -2, 'towers'], [1, -2, 'eixample'], [2, -2, 'eixample'],
  [-2, -1, 'towers'], [-2, 0, 'towers'], [-2, 1, 'eixample'],
  [-2, 2, 'eixample'], [-1, 2, 'eixample'], [0, 2, 'towers'], [1, 2, 'eixample'], [2, 2, 'eixample'],
];

// clip a rectangle to the chunk being written
function cityRect(W, x0, z0, x1, z1, fn) {
  const xa = Math.max(x0, W.x0), xb = Math.min(x1, W.x1), za = Math.max(z0, W.z0), zb = Math.min(z1, W.z1);
  for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) if (W.has(x, z)) fn(x, z);
}

function buildCityBlock(W, g, D, u0, v0, kind) {
  const { cx, cz, F } = D, X0 = cx + u0, Z0 = cz + v0;
  const seed = hash3(X0, 3, Z0, 77);
  // the ground: paving (a plaza for the towers, the pavement round the apartments)
  cityRect(W, X0, Z0, X0 + DI - 1, Z0 + DI - 1, (x, z) => {
    const a = x - X0, b = z - Z0;
    if (districtTop(x - cx, z - cz) !== B.GRASS && districtTop(x - cx, z - cz) !== B.PANOT) return;
    W.set(x, F - 1, z, (a % 6 === 0 || b % 6 === 0) && kind === 'towers' ? B.POLISHED_ANDESITE : B.PANOT);
    for (let y = F; y < F + 3; y++) if (W.get(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
  });
  if (kind === 'towers') {
    // two towers across the diagonal, a garden and a café pavilion in the other corners
    const flip = seed < 0.5;
    const hi = Math.max(6, Math.floor((CH - 12 - (F + 5)) / 4));
    const nA = clamp(Math.round(hi * (0.75 + 0.25 * hash3(X0, 5, Z0, 78))), 5, hi), nB = clamp(Math.round(hi * (0.45 + 0.3 * hash3(X0, 6, Z0, 79))), 4, hi);
    const sA = Math.floor(hash3(X0, 7, Z0, 80) * TOWER_STYLES.length), sB = (sA + 1 + Math.floor(seed * 3)) % TOWER_STYLES.length;
    const [p, q] = flip ? [[3, 3], [20, 20]] : [[20, 3], [3, 20]];
    cityTower(W, X0 + p[0], Z0 + p[1], 13, 13, F, nA, TOWER_STYLES[sA], flip ? 0 : 1, nA >= nB);
    cityTower(W, X0 + q[0], Z0 + q[1], 13, 13, F, nB, TOWER_STYLES[sB], flip ? 1 : 0, nA < nB);
    const [r, s] = flip ? [[20, 3], [3, 20]] : [[3, 3], [20, 20]];
    cityGarden(W, X0 + r[0], Z0 + r[1], F, seed);
    cityPavilion(W, X0 + s[0], Z0 + s[1], F, seed);
  } else cityEixample(W, X0, Z0, F, seed);
}

// A skyscraper: w × d, a 5-high glass lobby, n office floors 4 high, a roof. door: the side of the
// entrance (0 = +x, 1 = -x). The lift (lift.js) in the core stops at every floor and the roof.
function cityTower(W, x0, z0, w, d, F, n, st, door, helipad) {
  const x1 = x0 + w - 1, z1 = z0 + d - 1, roof = F + 5 + 4 * n;
  const slab = (y) => y === F + 5 || (y > F + 5 && (y - F - 5) % 4 === 0);
  const lx = x0 + (w >> 1), lz = z0 + (d >> 1);                  // lift shaft
  const dx = door === 0 ? 1 : -1;                                  // the lift opens towards the door
  cityRect(W, x0 - 1, z0 - 1, x1 + 1, z1 + 1, (x, z) => {
    const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
    if (!inside) { W.set(x, F - 1, z, B.POLISHED_ANDESITE); return; }
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
    const along = x === x0 || x === x1 ? z - z0 : x - x0;
    const core = Math.abs(x - lx) <= 1 && Math.abs(z - lz) <= 1, shaft = x === lx && z === lz;
    const opening = x === lx + dx && z === lz;
    W.set(x, F - 1, z, edge ? st.frame : shaft ? B.LIFT_FLOOR : st.lobby);
    for (let y = F; y <= roof + 1; y++) {
      let id = B.AIR;
      if (y === roof) id = shaft ? B.LIFT_FLOOR : edge ? st.crown : helipad ? B.ASPHALT : B.SMOOTH_STONE;
      else if (y === roof + 1) id = edge ? st.crown : B.AIR;
      else if (shaft) id = slab(y) ? B.LIFT_FLOOR : B.AIR;
      else if (core) {
        // the shaft's walls, open on the door side at each floor
        const fl = y < F + 5 ? F : F + 5 + 4 * Math.floor((y - F - 5) / 4) + 1;
        if (slab(y)) id = st.core;
        else if (opening && y - fl < 2) id = B.AIR;
        else id = opening || x === lx || z === lz ? B.GLASS : st.core;
      } else if (slab(y)) {
        id = edge ? st.band : (x + z) % 5 === 0 ? B.GLASS_LAMP : B.CONCRETE + 8;
      } else if (edge) {
        if (corner || along % 3 === 0) id = st.frame;
        else if (y < F + 5) id = y === F + 4 ? st.band : B.GLASS;
        else {
          const fl = Math.floor((y - F - 5) / 4), bay = Math.floor(along / 3);
          id = hash3(x0 + bay * 3 + (x === x0 ? 1 : x === x1 ? 2 : 0), fl, z0 + (z === z0 ? 1 : z === z1 ? 2 : 0), 81) < 0.55 ? B.WINDOW_LIT : B.GLASS_PANE;
        }
      }
      W.set(x, y, z, id);
    }
    // the lobby: a desk, sofas, a plant
    if (!edge && !core) {
      const a = x - x0, b = z - z0;
      if (b === 2 && a >= 3 && a <= w - 4) W.set(x, F, z, B.QUARTZ_SLAB);
      if (a === (door === 0 ? w - 3 : 2) && (b === d - 3 || b === d - 4)) W.set(x, F, z, B.SOFA_GRAY, door === 0 ? 1 : 0);
      if (a === (door === 0 ? 2 : w - 3) && b === d - 3) W.set(x, F, z, B.FLOOR_LAMP);
    }
  });
  // the entrance: sliding doors in the middle of the door side, a canopy over them
  const ex = door === 0 ? x1 : x0, mz = z0 + (d >> 1);
  if (ex >= W.x0 - 1 && ex <= W.x1 + 1) {
    placeADoors(W, [[ex, mz - 1], [ex, mz], [ex, mz + 1]].filter(([x, z]) => W.has(x, z)), F, door === 0 ? 0 : 1);
    for (let z = mz - 2; z <= mz + 2; z++) for (const k of [1, 2]) { const x = ex + dx * k; if (W.has(x, z)) W.set(x, F + 4, z, B.CONCRETE_SLAB, 8); }
  }
  // the roof: a lift house over the shaft, plant, a mast with a red light, a helipad on one
  cityRect(W, lx - 1, lz - 1, lx + 1, lz + 1, (x, z) => {
    const shaft = x === lx && z === lz, opening = x === lx + dx && z === lz;
    for (let y = roof + 1; y <= roof + 4; y++) W.set(x, y, z, y === roof + 4 ? st.crown : shaft || (opening && y <= roof + 2) ? B.AIR : st.core);
  });
  const mx = door === 0 ? x0 + 2 : x1 - 2, mz2 = z0 + 2;
  if (W.has(mx, mz2)) {
    for (let y = roof + 1; y <= Math.min(CH - 3, roof + 7); y++) W.set(mx, y, mz2, B.IRON_BARS);
    W.set(mx, Math.min(CH - 2, roof + 8), mz2, B.LED_RED);
  }
  if (helipad) {
    const hx = door === 0 ? x0 + 3 : x1 - 9, hz = z1 - 9;
    cityRect(W, hx, hz, hx + 6, hz + 6, (x, z) => {
      const a = x - hx, b = z - hz, r = Math.hypot(a - 3, b - 3);
      const H = (a === 2 || a === 4) && b >= 2 && b <= 4 || (a === 3 && b === 3);
      W.set(x, roof, z, H || (r > 2.6 && r < 3.5) ? B.ROAD_WHITE : B.ASPHALT);
    });
  } else {
    // air-conditioning units
    cityRect(W, x0 + 2, z1 - 4, x0 + 4, z1 - 3, (x, z) => { W.set(x, roof + 1, z, B.ALU_SLATS); });
    cityRect(W, x1 - 4, z1 - 4, x1 - 2, z1 - 3, (x, z) => { W.set(x, roof + 1, z, B.ALU_SLATS); });
  }
}

// a small garden: lawn, trees, benches round a fountain
function cityGarden(W, x0, z0, F, seed) {
  cityRect(W, x0, z0, x0 + 12, z0 + 12, (x, z) => {
    const a = x - x0, b = z - z0, r = Math.hypot(a - 6, b - 6);
    if (r < 1.8) { W.set(x, F - 1, z, B.WATER); W.set(x, F - 2, z, B.PRISMARINE_BRICKS); }
    else if (r < 2.8) { W.set(x, F - 1, z, B.POLISHED_DIORITE); W.set(x, F, z, B.POLISHED_DIORITE_SLAB); }
    else if (a === 6 || b === 6) W.set(x, F - 1, z, B.PANOT);
    else W.set(x, F - 1, z, B.GRASS);
  });
  for (const [a, b] of [[2, 2], [10, 2], [2, 10], [10, 10]]) if (W.has(x0 + a, z0 + b)) campusTree(W, x0 + a, F, z0 + b, seed < 0.5 ? 'cherry' : 'oak', 5);
  for (const [a, b, f] of [[6, 2, 4], [6, 10, 5], [2, 6, 0], [10, 6, 1]]) if (W.has(x0 + a, z0 + b)) W.set(x0 + a, F, z0 + b, shapeId('oak', 'stairs'), f);
  if (W.has(x0 + 12, z0 + 12)) campusLamp(W, x0 + 12, F, z0 + 12);
}
// a glass café pavilion with a flat roof and tables outside
function cityPavilion(W, x0, z0, F, seed) {
  cityRect(W, x0 + 2, z0 + 2, x0 + 10, z0 + 8, (x, z) => {
    const a = x - x0, b = z - z0, edge = a === 2 || a === 10 || b === 2 || b === 8;
    W.set(x, F - 1, z, B.PARQUET);
    for (let y = F; y <= F + 3; y++) W.set(x, y, z, y === F + 3 ? B.CONCRETE + 15 : !edge ? B.AIR : (a === 2 || a === 10) && (b === 2 || b === 8) ? B.CONCRETE + 15 : b === 8 && a === 6 && y < F + 2 ? B.AIR : B.GLASS);
    if (!edge && b === 3 && a >= 4 && a <= 8) W.set(x, F, z, B.KITCHEN_COUNTER, 4);
  });
  for (const [a, b] of [[4, 11], [8, 11]]) if (W.has(x0 + a, z0 + b)) { W.set(x0 + a, F, z0 + b, B.TABLE); if (W.has(x0 + a - 1, z0 + b)) W.set(x0 + a - 1, F, z0 + b, B.CHAIR, 0); if (W.has(x0 + a + 1, z0 + b)) W.set(x0 + a + 1, F, z0 + b, B.CHAIR, 1); }
  void seed;
}

// An Eixample block: a ring of apartment buildings 9 deep round a courtyard garden, the chamfered
// corners kept, shops on the ground floor, balconies on the street side, a roof terrace.
function cityEixample(W, X0, Z0, F, seed) {
  const n = 4 + Math.floor(seed * 3), roof = F + 4 + 3 * n;
  const wall = EIX_WALLS[Math.floor(hash3(X0, 9, Z0, 82) * EIX_WALLS.length)];
  const inB = (a, b) => a >= 1 && a <= 34 && b >= 1 && b <= 34 && Math.min(a, 35 - a) + Math.min(b, 35 - b) >= 6 && (Math.min(a, 35 - a) < 10 || Math.min(b, 35 - b) < 10);
  const street = (a, b) => a < 1 || a > 34 || b < 1 || b > 34 || Math.min(a, 35 - a) + Math.min(b, 35 - b) < 6;
  const slab = (y) => y === F + 4 || (y > F + 4 && (y - F - 4) % 3 === 0);
  cityRect(W, X0, Z0, X0 + 35, Z0 + 35, (x, z) => {
    const a = x - X0, b = z - Z0;
    if (!inB(a, b)) {
      // the courtyard: lawn, a path, trees
      if (!street(a, b)) {
        W.set(x, F - 1, z, a === 17 || a === 18 || b === 17 || b === 18 ? B.PANOT : B.GRASS);
        if ((a === 13 || a === 22) && (b === 13 || b === 22)) campusTree(W, x, F, z, (a + b) % 2 ? 'oak' : 'birch', 5);
      }
      return;
    }
    // facade cells face the street or the courtyard
    const nb = [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]];
    const outSt = nb.some(([p, q]) => street(p, q)), outIn = nb.some(([p, q]) => !inB(p, q) && !street(p, q));
    const facade = outSt || outIn;
    const t = a === 1 || a === 34 ? b : a;                        // along the facade
    W.set(x, F - 1, z, facade ? wall : B.PARQUET);
    for (let y = F; y <= roof + 1; y++) {
      let id = B.AIR;
      if (y === roof) id = facade ? wall : B.SMOOTH_STONE;
      else if (y === roof + 1) id = facade ? B.IRON_BARS : B.AIR;
      else if (slab(y)) id = facade ? wall : (a + b) % 6 === 0 ? B.GLASS_LAMP : B.PARQUET;
      else if (facade) {
        if (y < F + 4) {
          // shops: glass fronts on the street, a door every so often, a band above
          id = y === F + 3 ? B.CONCRETE + [14, 13, 11, 15][Math.floor(hash3(X0 + (t >> 3), 1, Z0, 83) * 4)] : outSt ? (t % 8 === 4 && y <= F + 1 ? B.AIR : t % 4 === 0 ? wall : B.GLASS_PANE) : wall;
        } else {
          const fl = Math.floor((y - F - 4) / 3), ry = (y - F - 4) % 3;
          id = t % 4 === 1 || t % 4 === 2 ? (ry >= 1 ? (hash3(x, fl, z, 84) < 0.45 ? B.WINDOW_LIT : B.GLASS_PANE) : wall) : wall;
        }
      }
      W.set(x, y, z, id);
    }
  });
  // balconies on the straight street sides: a slab out over the pavement and a railing
  for (const [side, fix] of [['a', 1], ['a', 34], ['b', 1], ['b', 34]]) for (let t = 10; t <= 25; t++) {
    if (t % 4 !== 1) continue;
    for (let k = 0; k < n; k++) {
      const y = F + 4 + 3 * k, o = fix === 1 ? -1 : 1;
      for (const tt of [t, t + 1]) {
        const x = side === 'a' ? X0 + fix + o : X0 + tt, z = side === 'a' ? Z0 + tt : Z0 + fix + o;
        if (!W.has(x, z)) continue;
        W.set(x, y, z, B.STONE_SLAB, 8);
        W.set(x, y + 1, z, B.IRON_BARS);
      }
    }
  }
}
