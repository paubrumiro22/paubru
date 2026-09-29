'use strict';
// The STUCOM district (worlds with generator 4 and up; structures.js calls planDistrict from
// stucomVillage instead of turning a village into the campus). No village houses: a small
// planned Eixample-style grid on levelled ground, three by three blocks ("illes") 36 wide with
// chamfered corners, separated by 10-wide streets (panot pavements, asphalt, lane lines, zebra
// crossings, plane trees and lamps). The middle block is Plaça Universitat (fountain, benches,
// kiosk, bus stop and the metro entrance); around it the school with real stairs and automatic
// doors, the Banc Central, the football pitch and a park with the annex and the Catalunya exit.
// The four corner blocks hold sixteen free building plots for the players. The metro runs under
// the square from Universitat to Catalunya, with wide stairs down that nothing is built over.
// Loaded in the chunk workers too (data-w): only deterministic code.

const DI = 36, DS = 10, DP = DI + DS;      // block ("illa") size, street width, grid pitch
const DHALF = 74, DBLEND = 20;
// Around the street grid the ground stays flat, open land for building, out to an irregular edge
// (DFLAT ± a few waves, never closer than 10 blocks to the grid) and then blends into the
// countryside. DOUT bounds all of it.
const DFLAT = 118, DOUT = 166;
function districtEdge(D, u, v) {
  const a = Math.atan2(v, u), q = D.ph;
  const r = DFLAT + 12 * Math.sin(3 * a + q[0]) + 8 * Math.sin(5 * a + q[1]) + 5 * Math.sin(8 * a + q[2]);
  const grid = DHALF / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
  return Math.max(r, grid + 10);
}
const METRO_DEPTH = 13;                    // platform this far under the street

// Position across a street (st 0..9) or, inside a block, its index k and local coordinate r.
function dBand(u) {
  const k = Math.floor((u + DI / 2) / DP), r = u + DI / 2 - k * DP;
  return r >= DI ? { st: r - DI, k, r: -1 } : { st: -1, k, r };
}

// Facing of an automatic door whose jamb (where the leaf slides to) is towards dir (0 1 4 5).
function adoorFacing(f, dir) {
  for (const q of [f, f | 8]) {
    const b = shapeGeom(SH_ADOOR_OPEN, q).boxes[0];
    const x = (b[0] + b[3]) / 2 - 8, z = (b[2] + b[5]) / 2 - 8;
    if ((Math.abs(x) > Math.abs(z) ? (x > 0 ? 0 : 1) : (z > 0 ? 4 : 5)) === dir) return q;
  }
  return f;
}
// A row of automatic doors (cells in order along the row) in a wall facing f: the outer ones
// slide outwards, so a pair or a trio parts from the middle.
function placeADoors(W, cells, y, f) {
  const n = cells.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = cells[i];
    const o = i < n / 2 ? cells[0] : cells[n - 1], p = i < n / 2 ? cells[n - 1] : cells[0];
    const dx = Math.sign(o[0] - p[0]), dz = Math.sign(o[1] - p[1]);
    const q = n === 1 ? f : adoorFacing(f, dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 4 : 5);
    W.set(x, y, z, B.AUTO_DOOR, q); W.set(x, y + 1, z, B.AUTO_DOOR_TOP, q);
  }
}

// ---------------------------------------------------------------- planning ----
function planDistrict(g, plan) {
  const cx = plan.x, cz = plan.z;
  // one level for everything: the median ground height over the grid
  const hs = [];
  for (let u = -66; u <= 66; u += 12) for (let v = -66; v <= 66; v += 12) hs.push(g.height(cx + u, cz + v));
  hs.sort((a, b) => a - b);
  const F = Math.max(SEA + 3, hs[hs.length >> 1] + 1);
  Object.assign(plan, {
    stucom: true, district: true, name: 'STUCOM', y: F, radius: 90, roadDirs: [],
    pieces: [], spawns: [], zones: [[cx - DOUT, cz - DOUT, cx + DOUT - 1, cz + DOUT - 1]],
  });
  // nothing else is built on the district or its edge
  for (const [k, p] of g.structs) {
    if (p && p !== plan && Math.max(Math.abs(p.x - cx), Math.abs(p.z - cz)) < DOUT + (p.radius || 40) + 6) g.structs.set(k, null);
  }
  const D = { cx, cz, F, P: F - METRO_DEPTH, furn: [], ph: [0, 1, 2].map((k) => hash3(cx, k, cz, 41) * Math.PI * 2) };
  // trees keep off the flat land and its edge (structZone)
  plan.inZone = (x, z) => Math.hypot(x - cx, z - cz) <= districtEdge(D, x - cx, z - cz) + DBLEND;
  plan.district = D;
  const box = (u0, v0, u1, v1) => [cx + u0, cz + v0, cx + u1, cz + v1];
  const piece = (b, build) => plan.pieces.push({ box: b, build });
  const home = (kind, prof, u, y, v, hu, hv, r) => plan.spawns.push({ kind, prof, x: cx + u + 0.5, y, z: cz + v + 0.5, home: [cx + hu + 0.5, cz + hv + 0.5], homeR: r });

  // plane trees and lamps along every pavement, clear of the crossings
  for (const b0 of [-74, -28, 18, 64]) for (let t = -DHALF; t < DHALF; t++) {
    const bt = dBand(t);
    if (bt.st >= 0) continue;
    // symmetric about the middle of each block, which stays clear (entrances face it)
    const kind = [5, 13, 22, 30].includes(bt.r) ? 'tree' : bt.r === 9 || bt.r === 26 ? 'lamp' : null;
    if (!kind) continue;
    for (const s of [1, 8]) {
      D.furn.push([cx + b0 + s, cz + t, kind]);   // street running along z
      D.furn.push([cx + t, cz + b0 + s, kind]);   // street running along x
    }
  }
  piece(box(-DOUT, -DOUT, DOUT - 1, DOUT - 1), (W) => buildDistrictBase(W, g, D));

  // ---- the square: Plaça Universitat ----
  piece(box(-19, -19, 18, 18), (W) => buildPlaza(W, g, D));
  plan.spawnAt = [cx - 5 + 0.5, F, cz - 4 + 0.5];
  home('villager', 'student', -3, F, 3, 0, 2, 12);
  home('villager', 'student', 5, F, 10, 2, 6, 12);
  home('villager', 'student', -12, F, -6, -8, 0, 10);

  // ---- north: the school, facing the square across the street ----
  const sx0 = cx - 8, szf = cz - 32;
  piece(box(-18, -64, 17, -29), (W) => buildSchoolBlock(W, g, D));
  piece([sx0 - 2, szf - 13, sx0 + 18, szf + 3], (W) => buildSchool(W, g, sx0, szf, -1, F, VSTYLE.temperate, true));
  // the teachers: the head of the school in the lobby, Noelia in a classroom, Pedro in the computer room
  const teacher = (person, hi, u, y, v, r) => plan.spawns.push({ kind: 'villager', prof: 'teacher', person, hi, x: cx + u + 0.5, y, z: cz + v + 0.5, home: [cx + u + 0.5, cz + v + 0.5], homeR: r });
  teacher('joan', 'Benvinguts a STUCOM! Sóc en Joan Zarzuela, el director.', 0, F, -37, 5);
  home('villager', 'student', 5, F, -38, 4, -38, 5);
  home('villager', 'student', -4, F + 7, -37, -3, -37, 5);
  teacher('noelia', 'Hola! Sóc la Noelia. Seieu, que comencem la classe.', 2, F + 11, -43, 4);
  home('villager', 'student', -3, F, -55, 0, -55, 9);
  teacher('laura', 'Hola! Sóc la Laura Tañá. Avui toca pràctica, obriu el projecte!', 3, F + 7, -43, 4);
  teacher('ramon', 'Bon dia! Sóc en Ramon Abad. Benvinguts a l\'aula d\'ordinadors!', 2, F + 15, -41, 4);

  // ---- west: the football pitch (its front towards the square) ----
  const campus = plan.campus = {};
  const pt = campus.pitch = { x0: cx - 51, z0: cz - 15, x1: cx - 30, z1: cz + 14, f: 0, F };
  {
    const L = lframe(pt.x0, pt.z0, 30, 22, 0);
    piece(box(-64, -18, -29, 17), (W) => buildGreenBlock(W, g, D, -1, 0));
    piece([pt.x0 - 1, pt.z0 - 1, pt.x1 + 1, pt.z1 + 1], (W) => buildPitch(W, g, L, F));
    const pc = [L.X(15, 9) - cx, L.Z(15, 9) - cz];
    for (const [a, d] of [[8, 8], [20, 10], [14, 5]]) home('villager', 'student', L.X(a, d) - cx, F, L.Z(a, d) - cz, pc[0], pc[1], 12);
  }

  // ---- east: Banc Central, its steps towards the square ----
  const bk = campus.bank = { x0: cx + 31, z0: cz - 8, x1: cx + 50, z1: cz + 8, f: 1, F };
  {
    const L = lframe(bk.x0, bk.z0, 17, 20, 1);
    piece(box(28, -18, 63, 17), (W) => buildGreenBlock(W, g, D, 1, 0));
    piece([bk.x0 - 3, bk.z0 - 3, bk.x1 + 2, bk.z1 + 3], (W) => buildBank(W, g, L, F, [[-1e9, -1e9, 1e9, 1e9]], true));
    for (const a of [4, 12]) plan.spawns.push({ kind: 'villager', prof: 'banker', x: L.X(a, 13) + 0.5, y: F + 2, z: L.Z(a, 13) + 0.5, home: [L.X(a, 13) + 0.5, L.Z(a, 13) + 0.5], homeR: 2.5 });
    home('villager', 'student', L.X(3, 8) - cx, F + 2, L.Z(3, 8) - cz, L.X(8, 8) - cx, L.Z(8, 8) - cz, 5);
  }

  // ---- south: the park with the annex, a garden and the Catalunya exit ----
  const an = campus.annex = { x0: cx + 2, z0: cz + 31, x1: cx + 16, z1: cz + 41, f: 5, F };
  campus.garden = { x0: cx + 3, z0: cz + 46, x1: cx + 15, z1: cz + 58, F };
  {
    const L = lframe(an.x0, an.z0, 15, 11, 5);
    piece(box(-18, 28, 17, 63), (W) => buildParkBlock(W, g, D));
    piece([an.x0 - 2, an.z0 - 2, an.x1 + 2, an.z1 + 2], (W) => buildAnnex(W, g, L, F, true));
    piece([cx + 2, cz + 45, cx + 16, cz + 59], (W) => buildGarden(W, g, cx + 3, cz + 46, F));
    const at = (a, d, y, r) => home('villager', y > F ? (a > 7 ? 'teacher' : 'student') : 'student', L.X(a, d) - cx, y, L.Z(a, d) - cz, L.X(a, d) - cx, L.Z(a, d) - cz, r);
    at(6, 4, F, 4); at(7, 6, F, 4); at(5, 6, F + 6, 2);
    teacher('pedro', 'Sóc en Pedro Porcuna, d\'informàtica. Heu provat d\'apagar i tornar a encendre?', L.X(10, 3) - cx, F + 6, L.Z(10, 3) - cz, 2);
    home('villager', 'student', 9, F, 49, 9, 50, 6);
    home('villager', 'student', -12, F, 50, -10, 48, 9);
  }

  // ---- the four corner blocks: free building plots (houses for sale: homes.js) ----
  plan.plots = [];
  for (const i of [-1, 1]) for (const j of [-1, 1]) {
    const u0 = i * DP - DI / 2, v0 = j * DP - DI / 2;
    piece(box(u0, v0, u0 + DI - 1, v0 + DI - 1), (W) => buildPlotBlock(W, g, D, u0, v0));
    for (const a0 of [3, 19]) for (const b0 of [3, 19]) {
      const x0 = cx + u0 + a0, z0 = cz + v0 + b0;
      plan.plots.push({ id: 'p' + (plan.plots.length + 1), x0, z0, x1: x0 + 13, z1: z0 + 13, F, front: b0 > 10 ? 1 : -1, sign: [x0 + 6, b0 > 10 ? z0 + 13 : z0] });
    }
  }

  // ---- the metro, last: nothing is ever built over its stairs ----
  const tx = cx + 12, at = (v) => [tx + 0.5, D.P - 1, cz + v + 0.5];
  piece(box(-5, -18, 22, 60), (W) => buildDistrictMetro(W, g, D));
  // ---- bus stops: shelters on the pavements of the two bus lines (bus.js drives the buses) ----
  for (const st of BUS_STOPS) if (!st.plaza) piece(box(st.u - 4, st.v - 4, st.u + 4, st.v + 4), (W) => buildBusShelter(W, g, D, st));

  // ---- Aeroport STUCOM, east of the ring road: terminal, apron, runway, control tower (airport.js) ----
  piece(box(74, -74, 142, 74), (W) => buildAirport(W, g, D));
  plan.airport = { u0: 74, u1: 128, v0: -60, v1: 60, term: [88, -14, 100, 14], runU: 120, parkU: 110 };

  // ---- Galeries STUCOM: the shopping arcade under the square, off the Universitat landing ----
  piece(box(-23, -16, -2, 16), (W) => buildMall(W, g, D));
  plan.shops = MALL_SHOPS.map((s) => ({ key: s.key, x0: cx + s.u0, z0: cz + s.v0, x1: cx + s.u1, z1: cz + s.v1, y: D.P }));
  for (const s of MALL_SHOPS) plan.spawns.push({ kind: 'villager', prof: 'shopkeeper', x: cx + s.keeper[0] + 0.5, y: D.P, z: cz + s.keeper[1] + 0.5, home: [cx + s.keeper[0] + 0.5, cz + s.keeper[1] + 0.5], homeR: 1.5 });
  plan.metro = {
    x: cx + 7, z: cz, y: D.P, depth: METRO_DEPTH, track: [tx, cz - 14, tx, cz + 56],
    line: { a: at(-14), b: at(56), stops: [{ name: 'Universitat', at: at(-9) }, { name: 'Catalunya', at: at(51) }] },
  };
}

// ---------------------------------------------------------------- ground and streets ----
function districtTop(u, v) {
  const bu = dBand(u), bv = dBand(v);
  if (bu.st >= 0 && bv.st >= 0) return B.ASPHALT;
  if (bu.st >= 0 || bv.st >= 0) {
    const alongZ = bu.st >= 0, s = alongZ ? bu.st : bv.st, r = alongZ ? bv.r : bu.r;
    if (s <= 1 || s >= 8) return B.PANOT;
    if (r <= 2 || r >= DI - 3) return s % 2 === 0 ? B.ROAD_WHITE : B.ASPHALT;              // zebra crossing
    if (s === 5 && r % 4 < 2) return alongZ ? B.ASPHALT_LINE : B.ASPHALT_LINE_X;          // dashed lane line
    return B.ASPHALT;
  }
  const a = bu.r, b = bv.r;
  if (Math.min(a, DI - 1 - a) + Math.min(b, DI - 1 - b) < 5) return B.PANOT;              // chamfered corner
  if (bu.k === 0 && bv.k === 0) return B.PANOT;                                            // the square
  if (bu.k !== 0 && bv.k !== 0) return (a >= 17 && a <= 18) || (b >= 17 && b <= 18) ? B.PANOT : B.GRASS;   // plots
  return B.GRASS;
}

// Levels the district (fills hollows, closes shallow caves, clears hills and trees above), lays
// the street surfaces, and blends the ground back into the countryside around it.
function buildDistrictBase(W, g, D) {
  const { cx, cz, F } = D;
  const xa = Math.max(W.x0, cx - DOUT), xb = Math.min(W.x1, cx + DOUT - 1);
  const za = Math.max(W.z0, cz - DOUT), zb = Math.min(W.z1, cz + DOUT - 1);
  if (xa > xb || za > zb) return;
  for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) {
    const u = x - cx, v = z - cz, h = g.height(x, z);
    const inGrid = u >= -DHALF && u < DHALF && v >= -DHALF && v < DHALF;
    if (!inGrid) {
      const r = Math.hypot(u + 0.5, v + 0.5), edge = districtEdge(D, u, v);
      if (r > edge + DBLEND) continue;
      if (r <= edge) {
        // open flat land, a few wild flowers
        for (let y = Math.min(h + 1, F - 7); y <= F - 2; y++) if (y > 0 && (y > h || !BLOCK_SOLID[W.get(x, y, z)])) W.set(x, y, z, y >= F - 4 ? B.DIRT : B.STONE);
        W.set(x, F - 1, z, B.GRASS);
        for (let y = F; y <= Math.max(h, F) + 14 && y < CH; y++) if (W.get(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
        const fl = hash3(x, 11, z, 5);
        if (fl < 0.025) W.set(x, F, z, [B.DANDELION, B.DAISY, B.CORNFLOWER, B.TALLGRASS][Math.floor(fl * 160)]);
        continue;
      }
      const t = Math.min(1, (r - edge) / DBLEND), s = t * t * (3 - 2 * t);
      const top = Math.round((F - 1) + (h - (F - 1)) * s);
      if (top === h) continue;
      for (let y = Math.min(h + 1, top); y < top; y++) if (y > 0) W.set(x, y, z, top - y > 3 ? B.STONE : B.DIRT);
      W.set(x, top, z, B.GRASS);
      for (let y = top + 1; y <= Math.max(h, top) + 12 && y < CH; y++) {
        const id = W.get(x, y, z);
        if (id !== B.AIR && !(IS_LIQUID(id) && y <= SEA)) W.set(x, y, z, B.AIR);
      }
      continue;
    }
    for (let y = Math.min(h + 1, F - 7); y <= F - 2; y++) if (y > 0 && (y > h || !BLOCK_SOLID[W.get(x, y, z)])) W.set(x, y, z, y >= F - 4 ? B.DIRT : B.STONE);
    W.set(x, F - 1, z, districtTop(u, v));
    for (let y = F; y <= Math.max(h, F) + 14 && y < CH; y++) if (W.get(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
  }
  // survey stones under the built blocks (the town planning board adds more, city.js)
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (W.has(cx + i * DP, cz + j * DP)) W.set(cx + i * DP, F - 6, cz + j * DP, B.CITY_MARK);
  // street trees in grated pits and lamps
  for (const [x, z, kind] of D.furn) {
    if (x < W.x0 - 3 || x > W.x1 + 3 || z < W.z0 - 3 || z > W.z1 + 3) continue;
    if (kind === 'lamp') { campusLamp(W, x, F, z); continue; }
    if (W.has(x, z)) W.set(x, F - 1, z, B.COARSE_DIRT);
    campusTree(W, x, F, z, hash3(x, 7, z, 3) < 0.5 ? 'oak' : 'birch', 5);
  }
}

// ---------------------------------------------------------------- the square ----
function buildPlaza(W, g, D) {
  const { cx, cz, F } = D;
  const L = { X: (a) => a, Z: (a, d) => d };
  const S = lwriter(W, L);
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  const fu = -8, fv = 7;                                   // fountain
  const inMetro = (u, v) => u >= -5 && u <= 5 && v >= -10 && v <= 1;
  // paving: panot with bands of polished stone, hydraulic tiles around the fountain
  for (let u = -18; u <= 17; u++) for (let v = -18; v <= 17; v++) {
    const x = cx + u, z = cz + v;
    if (!W.has(x, z) || districtTop(u, v) !== B.PANOT) continue;
    const r = Math.hypot(u - fu, v - fv);
    W.set(x, F - 1, z, r < 7.5 ? B.HYDRAULIC_TILE : (u + 18) % 6 === 0 || (v + 18) % 6 === 0 ? B.POLISHED_ANDESITE : B.PANOT);
    if (r < 3.6) { W.set(x, F - 1, z, B.WATER); W.set(x, F - 2, z, B.PRISMARINE_BRICKS); }
    else if (r < 4.7) { W.set(x, F - 1, z, B.POLISHED_DIORITE); W.set(x, F, z, B.POLISHED_DIORITE_SLAB); }
  }
  // the fountain's column with a glowing top
  for (let y = F - 2; y <= F + 1; y++) set(fu, y, fv, B.QUARTZ_PILLAR);
  set(fu, F + 2, fv, B.SEA_LANTERN);
  // benches round the fountain, backs to it
  for (const [u, v, f] of [[fu - 1, fv - 6, 5], [fu, fv - 6, 5], [fu - 1, fv + 6, 4], [fu, fv + 6, 4], [fu - 6, fv - 1, 1], [fu - 6, fv, 1], [fu + 6, fv - 1, 0], [fu + 6, fv, 0]]) set(u, F, v, shapeId('oak', 'stairs'), f);
  // big trees in raised planters
  for (const [u, v, kind] of [[-13, -12, 'cherry'], [11, -12, 'oak'], [12, 12, 'cherry'], [-15, 15, 'oak'], [13, 0, 'birch']]) {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      set(u + a, F - 1, v + b, B.GRASS);
      if (a || b) set(u + a, F, v + b, B.STONE_BRICK_SLAB);
    }
    campusTree(W, cx + u, F, cz + v, kind, 5);
  }
  // lamps
  for (const [u, v] of [[-16, -5], [-16, 5], [16, -5], [16, 5], [-6, -16], [7, -16], [-6, 16], [3, 16]]) campusLamp(W, cx + u, F, cz + v);
  // newspaper kiosk: green walls, a counter window and a red roof
  for (let u = 6; u <= 9; u++) for (let v = 5; v <= 7; v++) {
    const edge = u === 6 || u === 9 || v === 5 || v === 7;
    for (let y = F; y <= F + 1; y++) set(u, y, v, !edge ? B.AIR : v === 7 && y === F + 1 && u > 6 && u < 9 ? B.GLASS_PANE : B.CONCRETE + 13);
    set(u, F + 2, v, B.CONCRETE + 14);
  }
  for (let u = 6; u <= 9; u++) set(u, F + 2, 8, B.CONCRETE_SLAB, 8);
  set(7, F, 8, B.CRATE);
  set(10, F, 7, B.CITY_PANEL, 4);   // the town planning board (city.js)
  // bus stop at the south edge, facing the street
  for (let u = 9; u <= 13; u++) {
    for (const v of [15, 16, 17]) set(u, F + 2, v, B.CONCRETE_SLAB, 8);
    if (u === 9 || u === 13) { set(u, F, 15, B.IRON_BARS); set(u, F + 1, 15, B.IRON_BARS); }
    else { set(u, F, 15, B.GLASS_PANE); set(u, F + 1, 15, B.GLASS_PANE); set(u, F, 16, shapeId('oak', 'stairs'), 5); }
  }
  W.pic(cx + 11, F + 1, cz + 16, 4, 1, 1, 'timetable');
  for (let y = F; y <= F + 1; y++) set(15, y, 17, B.IRON_BARS);
  set(15, F + 2, 17, B.CONCRETE + 14);
  W.pic(cx + 15, F + 2, cz + 18, 4, 1, 1, 'bus');
  // bike rack and the campus sign on a quartz plinth
  for (let u = -16; u <= -12; u++) set(u, F, -16, B.IRON_BARS);
  for (let u = -8; u <= -6; u++) { set(u, F, -17, B.QUARTZ_BLOCK); set(u, F + 1, -17, B.QUARTZ_BLOCK); }
  S.pic(-8, F, -16, 4, 3, 2, 'campus');
  void inMetro;
}

// ---------------------------------------------------------------- the blocks ----
// North block: forecourt, lawns with cherry trees beside the school and a basketball court behind.
function buildSchoolBlock(W, g, D) {
  const { cx, cz, F } = D;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  for (let u = -18; u <= 17; u++) for (let v = -64; v <= -29; v++) {
    if (!W.has(cx + u, cz + v) || districtTop(u, v) !== B.GRASS) continue;
    const court = u >= -13 && u <= 12 && v >= -61 && v <= -49;
    const line = court && (u === -13 || u === 12 || v === -61 || v === -49 || u === 0 || Math.abs(Math.hypot(u + 0.5, v + 55) - 3) < 0.5);
    set(u, F - 1, v, v >= -31 ? (Math.abs(u) <= 3 ? B.HYDRAULIC_TILE : B.PANOT) : court ? (line ? B.CONCRETE : B.CONCRETE + 11) : (u === -1 || u === 0) && v < -44 ? B.PANOT : B.GRASS);
  }
  // basketball hoops
  for (const [u, s] of [[-15, 1], [14, -1]]) {
    for (let y = F; y <= F + 3; y++) set(u, y, -55, B.BLACKSTONE_WALL);
    for (let v = -56; v <= -54; v++) for (let y = F + 3; y <= F + 4; y++) set(u + s, y, v, B.CONCRETE);
    set(u + 2 * s, F + 3, -55, B.IRON_BARS);
  }
  // trees and benches on the lawns either side of the school
  for (const u of [-15, -12, 12, 15]) for (const v of [-42, -35]) campusTree(W, cx + u, F, cz + v, (u + v) % 2 ? 'cherry' : 'birch', 4);
  for (const u of [-16, -15, 13, 14]) set(u, F, -30, shapeId('oak', 'stairs'), 5);
  for (const [u, v] of [[-17, -46], [16, -46], [-17, -62], [16, -62]]) campusLamp(W, cx + u, F, cz + v);
  for (let u = 11; u <= 15; u++) set(u, F, -47, B.IRON_BARS);
}

// West and east blocks around the pitch and the bank: lawns, trees, a paved forecourt before the
// bank and a small car park behind it.
function buildGreenBlock(W, g, D, i) {
  const { cx, cz, F } = D;
  const u0 = i * DP - DI / 2;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  for (let u = u0; u < u0 + DI; u++) for (let v = -18; v <= 17; v++) {
    if (!W.has(cx + u, cz + v) || districtTop(u, v) !== B.GRASS) continue;
    let top = B.GRASS;
    if (i > 0 && u <= 30) top = B.PANOT;                                  // before the bank's steps
    if (i > 0 && u >= 53 && u <= 61 && v >= -12 && v <= 11) top = (v + 12) % 4 === 0 && u >= 55 ? B.ROAD_WHITE : B.ASPHALT;   // car park
    if (i < 0 && u >= -29) top = B.PANOT;                                 // before the pitch gate
    set(u, F - 1, v, top);
  }
  const trees = i > 0 ? [[56, -16], [60, -16], [56, 15], [60, 15], [32, -15], [32, 14], [46, -15], [46, 14]] : [[-59, -12], [-59, -4], [-59, 4], [-59, 12], [-40, -17], [-40, 16]];
  for (const [u, v] of trees) campusTree(W, cx + u, F, cz + v, (u + v) & 1 ? 'oak' : 'birch', 5);
  const benches = i > 0 ? [] : [[-61, -8, 1], [-61, -7, 1], [-61, 7, 1], [-61, 8, 1]];
  for (const [u, v, f] of benches) set(u, F, v, shapeId('oak', 'stairs'), f);
  for (const [u, v] of i > 0 ? [[52, -13], [52, 12]] : [[-62, 0], [-45, -17], [-45, 16]]) campusLamp(W, cx + u, F, cz + v);
}

// South block: lawns with a hedge, paths, trees, a playground, the garden and the annex (their own
// pieces) and the stairs down to Catalunya (the metro piece).
function buildParkBlock(W, g, D) {
  const { cx, cz, F } = D;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  const reserved = (u, v) => (u >= 0 && v <= 43) || (u >= 1 && u <= 17 && v >= 44 && v <= 60) || (u >= -5 && u <= 5 && v >= 45 && v <= 56);
  const path = (u, v) => (v >= 44 && v <= 45) || (u >= -10 && u <= -9) || (v >= 54 && v <= 55 && u >= -10 && u <= 0) || (u >= -2 && u <= 0 && v <= 43) || (u >= 6 && u <= 12 && v <= 30);
  for (let u = -18; u <= 17; u++) for (let v = 28; v <= 63; v++) {
    const x = cx + u, z = cz + v;
    if (!W.has(x, z) || districtTop(u, v) !== B.GRASS) continue;
    if (path(u, v)) { W.set(x, F - 1, z, B.PANOT); continue; }
    if (reserved(u, v)) continue;
    const bu = dBand(u).r, bv = dBand(v).r;
    const edge = bu === 0 || bu === DI - 1 || bv === 0 || bv === DI - 1;
    if (edge) W.set(x, F, z, B.LEAVES);
    else if (u >= -17 && u <= -12 && v >= 56 && v <= 61) { W.set(x, F - 1, z, B.SAND); if (u === -17 || u === -12 || v === 56 || v === 61) W.set(x, F, z, B.PLANK_SLAB); }
    else if (hash3(x, 2, z, 9) < 0.05) W.set(x, F, z, [B.DANDELION, B.ROSE, B.DAISY, B.CORNFLOWER][Math.floor(hash3(x, 4, z, 9) * 4)]);
  }
  // a climbing frame by the sandpit
  for (const [u, v] of [[-16, 58], [-13, 58]]) for (let y = F; y <= F + 2; y++) set(u, y, v, B.OAK_FENCE);
  for (let u = -16; u <= -13; u++) set(u, F + 3, 58, B.OAK_FENCE);
  // trees on the lawns, benches by the paths, lamps
  for (const [u, v, k] of [[-15, 32, 'oak'], [-5, 33, 'cherry'], [-15, 40, 'birch'], [-6, 39, 'oak'], [-14, 49, 'cherry'], [-5, 60, 'birch'], [-3, 61, 'oak']]) campusTree(W, cx + u, F, cz + v, k, 5);
  for (const [u, v, f] of [[-16, 43, 5], [-15, 43, 5], [-6, 46, 4], [-5, 46, 4], [-11, 36, 1], [-11, 37, 1]]) set(u, F, v, shapeId('oak', 'stairs'), f);
  for (const [u, v] of [[-8, 43], [-8, 56], [-17, 46], [-3, 42]]) campusLamp(W, cx + u, F, cz + v);
}

// Corner blocks: four fenced 14 x 14 plots each, with paths between them.
function buildPlotBlock(W, g, D, u0, v0) {
  const { cx, cz, F } = D;
  for (const a0 of [3, 19]) for (const b0 of [3, 19]) {
    const x0 = cx + u0 + a0, z0 = cz + v0 + b0, x1 = x0 + 13, z1 = z0 + 13;
    if (!rectHits(W, x0, z0, x1, z1)) continue;
    // lawn inside a flat stone kerb, a lantern on a post at each corner
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (!W.has(x, z)) continue;
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      W.set(x, F - 1, z, edge ? B.POLISHED_ANDESITE : B.GRASS);
      if ((x === x0 || x === x1) && (z === z0 || z === z1)) { W.set(x, F, z, B.BLACKSTONE_WALL); W.set(x, F + 1, z, B.LANTERN, 0); }
    }
    // the "SOLAR LLIURE" sign on a low quartz plinth by the edge that faces the street
    const zs = b0 > 10 ? z1 : z0, f = b0 > 10 ? 4 : 5, mx = x0 + 6;
    for (let x = mx; x <= mx + 1; x++) { W.set(x, F, zs, B.QUARTZ_BLOCK); W.set(x, F + 1, zs, B.QUARTZ_BLOCK); }
    W.pic(f === 4 ? mx : mx + 1, F, zs + (f === 4 ? 1 : -1), f, 2, 2, 'plot');
  }
  campusLamp(W, cx + u0 + 17, F, cz + v0 + 17);
  for (const [a, b, f] of [[17, 10, 1], [17, 11, 1], [18, 26, 0], [18, 25, 0]]) W.set(cx + u0 + a, F, cz + v0 + b, shapeId('oak', 'stairs'), f);
}

// ---------------------------------------------------------------- the metro ----
// The underpass between the two platforms of a double-track station, in a station's local frame
// (set(a, y, s, id, f): a across the tracks, s along them, platforms at floor level P). Two stairs
// 2 wide (at a = aW and a = aE) go down along s from s0 in the direction dir to a corridor under
// both tracks. faceDown: the stair facing for going down that way. pillar(a, s): no railing there.
function metroUnderpass(set, P, aW, aE, s0, dir, faceDown, stripe, pillar) {
  const st = shapeId('terrazzo', 'stairs');
  const S = (k) => s0 + dir * k;
  // a solid shell, then the corridor carved in it
  for (let a = aW - 1; a <= aE + 2; a++) for (let k = -1; k <= 7; k++) for (let y = P - 7; y <= P - 3; y++) set(a, y, S(k), B.CONCRETE + 7);
  for (let a = aW; a <= aE + 1; a++) for (const k of [5, 6]) {
    set(a, P - 6, S(k), B.TERRAZZO);
    set(a, P - 5, S(k), B.AIR); set(a, P - 4, S(k), B.AIR);
    set(a, P - 3, S(k), (a - aW) % 4 === 1 && k === 5 ? B.GLASS_LAMP : B.CONCRETE + 8);
  }
  for (let a = aW; a <= aE + 1; a++) set(a, P - 4, S(7), stripe);
  for (const col of [aW, aE]) for (let c = col; c <= col + 1; c++) for (let k = 0; k <= 4; k++) {
    const y = P - 1 - k;
    set(c, y, S(k), st, faceDown);
    set(c, y - 1, S(k), B.TERRAZZO);
    for (let yy = y + 1; yy <= P - 1; yy++) set(c, yy, S(k), B.AIR);
  }
  // railings along the openings on the walkway side (the platform edges stay clear for the doors)
  for (let k = 0; k <= 4; k++) {
    for (const a of [aW - 1, aE - 1]) if (!pillar || !pillar(a, S(k))) set(a, P, S(k), B.IRON_BARS);
  }
  for (const a of [aW, aW + 1, aE, aE + 1]) set(a, P, S(5), B.IRON_BARS);
}

// Universitat under the square, a straight tunnel and Catalunya under the park. The track runs
// along z at u = 12, the platform on its west side. Each station has a wide stair from the street
// (open at the top, with railings, a glass canopy and the red M) down to a landing that opens onto
// the platform.
function buildDistrictMetro(W, g, D) {
  const { cx, cz, F, P } = D;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  const L = { X: (a) => cx + a, Z: (a, d) => cz + d };
  const S = lwriter(W, L);
  // two tracks: towards Catalunya at u = 12 (by the main platform), back at u = 15 (far platform
  // u 17..20, reached by the underpass)
  const hall = (v0, v1, stripe, mouth) => {
    const vb = mouth === v0 ? v1 - 1 : v0 + 1;      // buffer stops at the closed end
    for (let u = 3; u <= 21; u++) for (let v = v0; v <= v1; v++) {
      const endWall = v === v0 || v === v1, open = u >= 11 && u <= 16 && v === mouth;
      const wall = u === 3 || u === 21 || (endWall && !open);
      const railRun = mouth === v1 ? v > vb && v <= v1 : v >= v0 && v < vb;
      for (let y = P - 3; y <= P + 6; y++) {
        let id = B.AIR;
        if (y === P + 6) id = B.CONCRETE;
        else if (y === P + 5) id = !wall && (u + v) % 4 === 0 ? B.GLASS_LAMP : B.CONCRETE + 8;
        else if (wall) id = y === P + 1 ? stripe : y < P - 1 ? B.CONCRETE + 7 : B.CONCRETE;
        else if (y === P - 1) id = u <= 10 ? (u === 10 ? B.CONCRETE + 4 : B.TERRAZZO) : u >= 17 ? (u === 17 ? B.CONCRETE + 4 : B.TERRAZZO) : (u === 12 || u === 15) && railRun ? B.RAIL : B.AIR;
        else if (y === P - 2) id = u >= 11 && u <= 16 ? B.GRAVEL : B.CONCRETE + 7;
        else if (y < P - 2) id = B.CONCRETE + 7;
        set(u, y, v, id);
      }
    }
    for (let u = 11; u <= 16; u++) { set(u, P - 1, vb, B.CONCRETE + 15); set(u, P, vb, B.CONCRETE + 14); }
  };
  hall(-16, 12, B.BLUE_TILES, 12);
  hall(31, 58, B.CONCRETE + 14, 31);
  // the trains know a platform by the marker under its track (metro_panel.js)
  for (const [m0, m1] of [[-14, 11], [31, 56]]) for (let v = m0; v <= m1; v++) { set(12, P - 2, v, B.METRO_MARK); set(15, P - 2, v, B.METRO_MARK); }
  set(3, P + 1, -7, B.METRO_PANEL, 0);
  set(3, P + 1, 42, B.METRO_PANEL, 0);
  // tunnel between them: walls, a vault, lamps, both tracks
  for (let v = 13; v <= 30; v++) for (let u = 10; u <= 17; u++) for (let y = P - 3; y <= P + 4; y++) {
    const wall = u === 10 || u === 17, roof = y === P + 4 || (y === P + 3 && (u === 11 || u === 16));
    let id = B.AIR;
    if (y <= P - 2) id = y === P - 2 && !wall ? B.GRAVEL : B.CONCRETE + 7;
    else if (wall || roof) id = y === P ? B.BLUE_TILES : B.CONCRETE + 8;
    else if (y === P + 3 && (u === 13 || u === 14)) id = (v + u) % 8 === 4 ? B.GLASS_LAMP : B.CONCRETE + 8;
    else if (y === P - 1 && (u === 12 || u === 15)) id = B.RAIL;
    set(u, y, v, id);
  }
  // the crossovers where the trains change track before each terminus (metro.js drives them)
  for (const [u, v] of [[13, 28], [13, 27], [14, 26], [14, 25], [14, 18], [14, 17], [13, 16], [13, 15]]) set(u, P - 1, v, B.RAIL);
  // platform furniture: columns, benches against the walls, signs, map, a ticket machine
  for (const [v0, v1, name, stripe, benches] of [[-16, 12, 'metro_name', B.BLUE_TILES, [-9, -8, 3, 4]], [31, 58, 'metro_name2', B.CONCRETE + 14, [45, 46, 50, 51]]]) {
    for (let v = v0 + 5; v < v1 - 3; v += 7) for (let y = P; y <= P + 4; y++) set(7, y, v, y === P + 1 ? stripe : B.QUARTZ_PILLAR);
    const closed = v0 < 0 ? -1 : 1, s0 = closed < 0 ? v0 + 7 : v1 - 8;
    for (const v of benches) {
      set(4, P, v, shapeId('oak', 'stairs'), 1);
      if ((v - s0) * closed < -1 || (v - s0) * closed > 6) set(20, P, v, shapeId('oak', 'stairs'), 0);
    }
    S.pic(20, P + 2, v0 + 6, 1, 3, 1, name, true);
    S.pic(20, P + 2, v1 - 10, 1, 3, 1, name, true);
    S.pic(20, P + 1, v0 + 16, 1, 2, 1, v0 < 0 ? 'sunset' : 'mountains', true);
    S.pic(4, P + 2, v0 + 20, 0, 3, 1, name, true);
    S.pic(4, P + 1, v0 + 3, 0, 2, 1, 'metro_map', true);
    S.pic(4, P + 2, v0 + 12, 0, 1, 1, 'metro', true);
    set(4, P, v0 + 1, B.VENDING_MACHINE, 0);
    // the underpass to the far platform, at the closed end
    metroUnderpass(set, P, 8, 19, s0, closed, closed > 0 ? 5 : 4, stripe, (u, v) => u === 7 && (v - v0 - 5) % 7 === 0);
  }
  // the stairs: 3 wide at u -1..1 between tiled walls; dir = the way they go down along z
  const stairs = (vTop, dir, stripe) => {
    const n = F - P, face = dir > 0 ? 5 : 4, st = shapeId('terrazzo', 'stairs');
    for (let k = 0; k < n; k++) {
      const v = vTop + dir * k, y = F - 1 - k, open = k <= 4;
      const clear = open ? F + 3 : y + 4;
      for (let u = -1; u <= 1; u++) {
        set(u, y, v, st, face);
        set(u, y - 1, v, B.TERRAZZO);
        for (let yy = y + 1; yy <= clear; yy++) set(u, yy, v, B.AIR);
        if (!open && clear + 1 < F - 1) set(u, clear + 1, v, u === 0 && k % 3 === 0 ? B.GLASS_LAMP : B.CONCRETE + 8);
      }
      for (const u of [-2, 2]) for (let yy = y - 1; yy <= Math.min(clear + 1, F - 2); yy++) set(u, yy, v, yy === y + 2 ? stripe : B.CONCRETE);
    }
    // landing at platform level and the way through into the hall
    for (let j = 1; j <= 3; j++) {
      const v = vTop + dir * (n - 1 + j);
      for (let u = -2; u <= 3; u++) for (let y = P - 2; y <= P + 4; y++) {
        const edge = u === -2;
        let id = B.AIR;
        if (y === P - 2) id = B.CONCRETE + 7;
        else if (y === P - 1) id = B.TERRAZZO;
        else if (y === P + 4) id = u === 0 && j === 2 ? B.GLASS_LAMP : B.CONCRETE + 8;
        else if (edge) id = y === P + 1 ? stripe : B.CONCRETE;
        else if (u >= 2 && y > P + 2) id = B.CONCRETE;
        set(u, y, v, id);
      }
    }
    // fare gates into the hall (a metro card opens them, metro_panel.js)
    for (let j = 1; j <= 3; j++) set(2, P, vTop + dir * (n - 1 + j), B.TURNSTILE, 0);
    // the card machine on the landing, facing the stairs, with its sign on the wall beside it
    set(-1, P, vTop + dir * (n + 1), B.TICKET_MACHINE, dir > 0 ? 5 : 4);
    S.pic(-1, P + 2, vTop + dir * (n + 1), 0, 1, 1, 'metro_cards');
    const vEnd = vTop + dir * (n + 3);
    for (let u = -2; u <= 3; u++) for (let y = P - 1; y <= P + 4; y++) set(u, y, vEnd, y === P + 1 ? stripe : B.CONCRETE);
    S.pic(-1, P + 1, vEnd - dir, dir > 0 ? 5 : 4, 3, 1, 'metro_map');
    // surface: railings round the opening, a glass canopy on posts with a red front, the M
    const top = [vTop, vTop + dir * 4], v0 = Math.min(...top), v1 = Math.max(...top);
    const vIn = vTop - dir, vBack = vTop + dir * 5;
    for (let v = Math.min(v0, vBack); v <= Math.max(v1, vBack); v++) for (const u of [-2, 2]) set(u, F, v, B.IRON_BARS);
    for (let u = -1; u <= 1; u++) set(u, F, vBack, B.IRON_BARS);
    // a paved surround, so the edge of the opening is stone and not earth
    for (let v = Math.min(vIn, vBack) - 1; v <= Math.max(vIn, vBack) + 1; v++) for (let u = -3; u <= 3; u++) {
      const hole = Math.abs(u) <= 1 && (v - vTop) * dir >= 0 && (v - vTop) * dir <= 4;
      if (!hole) set(u, F - 1, v, B.POLISHED_ANDESITE);
    }
    for (let u = -2; u <= 2; u++) for (let v = Math.min(vIn, vTop + dir * 3); v <= Math.max(vIn, vTop + dir * 3); v++) {
      set(u, F + 3, v, v === vIn ? B.CONCRETE + 14 : B.GLASS);
      set(u, F - 1, vIn, B.POLISHED_ANDESITE);
    }
    for (const u of [-2, 2]) for (let y = F; y <= F + 2; y++) { set(u, y, vIn, B.BLACKSTONE_WALL); if (y > F) set(u, y, vTop + dir * 3, B.BLACKSTONE_WALL); }
    for (let u = -1; u <= 1; u++) for (let y = F; y <= F + 2; y++) set(u, y, vIn, B.AIR);
    S.pic(-1, F + 3, vIn - dir, dir > 0 ? 5 : 4, 3, 1, stripe === B.BLUE_TILES ? 'metro_name' : 'metro_name2');
    // a sign by the entrance: the card machine is inside, before the gates
    set(3, F, vIn, B.BLACKSTONE_WALL); set(3, F + 1, vIn, B.BLACKSTONE_WALL);
    set(3, F - 1, vIn, B.POLISHED_ANDESITE);
    S.pic(3, F + 1, vIn - dir, dir > 0 ? 5 : 4, 1, 1, 'metro_cards');
    // the pole with the M beside the entrance
    for (let y = F; y <= F + 3; y++) set(-4, y, vIn, B.BLACKSTONE_WALL);
    set(-4, F + 4, vIn, B.CONCRETE + 14);
    S.pic(-4, F + 4, vIn - dir, dir > 0 ? 5 : 4, 1, 1, 'metro');
    S.pic(-4, F + 4, vIn + dir, dir > 0 ? 4 : 5, 1, 1, 'metro');
  };
  stairs(-6, 1, B.BLUE_TILES);
  stairs(52, -1, B.CONCRETE + 14);
}

// ---------------------------------------------------------------- the school, generator 4 ----
// Real stairs instead of the old ladder: flights of terrazzo steps in the left bay, switching
// back at each floor (up towards the back in lanes a 1..2, up towards the front in lanes 4..5),
// glass balustrades, railings round every opening and a stair hut on the roof terrace.
function schoolStairs(W, x0, Z, sz, F, floors, roof) {
  const set = (a, y, d, id, f) => W.set(x0 + a, y, Z(d), id, f);
  const st = shapeId('terrazzo', 'stairs'), fBack = sz > 0 ? 4 : 5, fFront = sz > 0 ? 5 : 4;
  const flights = [
    { a0: 1, dir: 1, d0: 3, y0: F, n: 6 },
    { a0: 4, dir: -1, d0: 9, y0: F + 7, n: 3 },
    { a0: 1, dir: 1, d0: 7, y0: F + 11, n: 3 },
    { a0: 4, dir: -1, d0: 9, y0: F + 15, n: 3 },
    { a0: 1, dir: 1, d0: 7, y0: roof - 3, n: 3 },
  ];
  for (const fl of flights) for (let k = 0; k < fl.n; k++) {
    const d = fl.d0 + fl.dir * k, y = fl.y0 + k;
    for (let a = fl.a0; a <= fl.a0 + 1; a++) {
      for (let yy = fl.y0; yy < y; yy++) set(a, yy, d, B.PLASTER);          // solid under the steps
      set(a, y, d, st, fl.dir > 0 ? fBack : fFront);
      for (let yy = y + 1; yy <= y + 3; yy++) set(a, yy, d, B.AIR);         // headroom through the floor above
    }
  }
  // glass balustrades between the flights and along their open sides
  for (let d = 4; d <= 8; d++) for (let y = F; y <= F + Math.min(5, d - 1); y++) set(3, y, d, B.GLASS_PANE);
  for (const y0 of [F + 7, F + 11, F + 15, F + 19]) for (let d = 7; d <= 9; d++) for (let y = y0; y <= y0 + 2; y++) set(3, y, d, B.GLASS_PANE);
  for (let d = 6; d <= 8; d++) for (let y = F + 7; y <= F + 9; y++) set(3, y, d, B.GLASS_PANE);
  for (const y0 of [F + 7, F + 15]) for (let d = 7; d <= 9; d++) for (let y = y0; y <= y0 + 4; y++) if (y !== y0 + 3) set(6, y, d, B.GLASS_PANE);
  // railings round the openings in each floor
  for (let a = 1; a <= 2; a++) { set(a, F + 7, 5, B.IRON_BARS); set(a, F + 15, 6, B.IRON_BARS); }
  for (const y of [F + 11, F + 19]) for (let a = 4; a <= 5; a++) set(a, y, 10, B.IRON_BARS);
  // the stair hut on the roof: a lamp inside, the way out onto the terrace towards +a
  for (let a = 0; a <= 3; a++) for (let d = 6; d <= 11; d++) {
    const wall = a === 0 || a === 3 || d === 6 || d === 11;
    for (let y = roof + 1; y <= roof + 3; y++) {
      const door = a === 3 && d === 10 && y <= roof + 2;
      if (wall && !door) set(a, y, d, a === 3 && (d === 8 || d === 9) && y === roof + 2 ? B.GLASS_PANE : B.PLASTER);
      else if (!wall && d === 10) set(a, y, d, B.AIR);
    }
    set(a, roof + 4, d, B.SMOOTH_STONE);
  }
  set(1, roof + 3, 10, B.LANTERN, 8);
  set(1, roof + 5, 8, B.SANDSTONE_SLAB);
}

// Lobby, lockers and classrooms, kept clear of the stairs.
function schoolFurnish(W, x0, Z, set, F, floors, out) {
  const D = 13;
  // lobby: reception desk with a lamp, benches, lockers, the sunset picture, lamps
  for (let a = 11; a <= 14; a++) set(a, F, 4, B.SPRUCE_PLANKS);
  set(14, F + 1, 4, B.LANTERN, 0);
  set(12, F, 5, shapeId('oak', 'stairs'), out);
  for (let a = 11; a <= 14; a++) set(a, F, 9, shapeId('oak', 'stairs'), out);
  for (let a = 5; a <= 10; a++) for (let y = F; y <= F + 1; y++) set(a, y, D - 2, B.LOCKER, out);
  W.pic(out === 5 ? x0 + 14 : x0 + 12, F + 2, Z(D - 2), out, 3, 2, 'sunset');
  for (const a of [8, 12]) set(a, F + 5, 6, B.LANTERN, 8);
  for (const [a, d] of [[15, 1], [15, 11]]) { set(a, F, d, B.PODZOL); set(a, F + 1, d, B.BUSH); }
  // classrooms: desks and chairs facing the board on the back wall
  for (const fl of floors.slice(1)) {
    const board = fl === floors[2] ? B.CHALKBOARD : B.WHITEBOARD;
    for (let a = 7; a <= 14; a++) for (let y = fl + 1; y <= fl + 2; y++) set(a, y, D - 1, board, out);
    set(15, fl + 2, D - 1, B.CORKBOARD, out);
    set(11, fl + 1, D - 3, B.SPRUCE_PLANKS); set(12, fl + 1, D - 3, B.SPRUCE_PLANKS);
    for (const d of [3, 5, 7]) for (const a of [8, 9, 11, 12, 14, 15]) {
      set(a, fl + 1, d + 1, B.PLANK_SLAB);
      set(a, fl + 1, d, shapeId('oak', 'stairs'), out);
    }
    for (const a of [9, 13]) set(a, fl + 3, 6, B.LANTERN, 8);
  }
}

// ---------------------------------------------------------------- the school, finished ----
// The entrance closed round properly (the vestibule had open sides into the lobby), a steel and
// stone canopy over the doors, the lobby and classrooms furnished with real furniture (sofas, a
// TV, reception with a computer, tables, chairs, a computer room, pendant lamps), a panoramic
// glass lift in the right-hand back corner that serves every floor and the roof (lift.js runs it),
// and a roof garden café on the terrace.
function schoolUpgrade(W, x0, Z, set, sz, F, floors, roof, out) {
  const inw = out === 4 ? 5 : 4;
  // +a in the world is +x: facing 0 has its back towards +a, 1 towards -a
  const toA = 0, fromA = 1;
  // ---- entrance ----
  for (const a of [5, 11]) {
    for (let d = 1; d <= 2; d++) for (let y = F; y <= F + 3; y++) set(a, y, d, B.SANDSTONE);
    set(a, F + 5, 0, B.SANDSTONE);
    for (let y = F; y <= F + 4; y++) set(a, y, -1, shapeId('marble', 'pillar'), 0);   // columns either side
  }
  for (let a = 6; a <= 10; a++) set(a, F - 1, 0, B.SMOOTH_STONE);                       // threshold
  // canopy: stone slab on steel posts, lit from beneath
  for (let a = 3; a <= 13; a++) for (let d = -4; d <= -2; d++) set(a, F + 3, d, B.SANDSTONE_SLAB);
  for (let a = 4; a <= 12; a++) set(a, F + 3, -1, B.SANDSTONE_SLAB);
  for (const a of [3, 13]) for (let y = F; y <= F + 2; y++) set(a, y, -4, B.IRON_BARS);
  for (const a of [5, 8, 11]) set(a, F + 2, -3, B.CEILING_LAMP, 0);
  // doormat
  for (let a = 7; a <= 9; a++) set(a, F - 1, -1, B.SMOOTH_STONE), set(a, F, 1, B.RUG_RED, 0);

  // ---- lobby ----
  set(12, F, 5, B.CHAIR, inw);                                                           // receptionist
  set(12, F + 1, 4, B.DESKTOP_PC, out);
  set(13, F + 1, 4, B.AIR);
  for (let a = 11; a <= 14; a++) set(a, F, 9, B.AIR);
  for (let d = 6; d <= 8; d++) set(11, F, d, B.SOFA_BLUE, fromA);                         // waiting area facing the TV
  for (let d = 6; d <= 8; d++) for (let a = 12; a <= 14; a++) set(a, F, d, B.RUG_BEIGE, 0);
  set(13, F, 7, B.COFFEE_TABLE, fromA);
  set(15, F, 7, B.KITCHEN_COUNTER, toA); set(15, F + 1, 7, B.TV_ON, toA);
  set(15, F + 2, 4, B.PAINTING_CITY, toA); set(15, F + 2, 9, B.PAINTING_SEA, toA);
  set(9, F, 10, B.VENDING_MACHINE, out); set(10, F, 10, B.VENDING_MACHINE, out);
  set(15, F, 11, B.AIR); set(15, F + 1, 11, B.AIR);
  for (const [a, d] of [[8, 6], [12, 6], [12, 9]]) set(a, F + 5, d, B.CEILING_LAMP, 0);

  // ---- classrooms ----
  floors.slice(1).forEach((fl, i) => {
    const lab = i === 2;                                        // the third floor is the computer room
    for (let d = 3; d <= 8; d++) for (const a of [8, 9, 11, 12, 14, 15]) set(a, fl + 1, d, B.AIR);
    for (const d of [3, 5, 7]) for (const a of [8, 9, 11, 12, 14, 15]) {
      set(a, fl + 1, d + 1, B.TABLE, 0);
      set(a, fl + 1, d, B.CHAIR, out);
      if (lab) set(a, fl + 2, d + 1, B.DESKTOP_PC, inw);
    }
    set(15, fl + 2, 12, B.PLASTER); set(6, fl + 2, 12, B.CORKBOARD, out);
    set(11, fl + 1, 10, B.TABLE, 0); set(12, fl + 1, 10, B.TABLE, 0);                       // teacher's desk
    set(11, fl + 2, 10, B.DESKTOP_PC, out); set(12, fl + 1, 11, B.CHAIR, inw);
    for (const a of [9, 13]) set(a, fl + 3, 6, B.CEILING_LAMP, 0);
    set(7, fl + 3, 9, B.CEILING_LAMP, 0);
    set(7, fl + 2, 1, i % 2 ? B.PAINTING_FLOWERS : B.PAINTING_ABSTRACT, out === 4 ? 5 : 4);
  });

  // ---- the glass lift: shaft at a = 15, d = 10..11, doors on the a = 14 side ----
  const stops = [F, ...floors.slice(1).map((f) => f + 1), roof + 1];
  const top = roof + 3;
  for (let y = F; y <= top; y++) for (const d of [10, 11]) {
    const plate = y === F - 1 || floors.includes(y) && y > F || y === roof;
    set(15, y, d, plate ? B.LIFT_FLOOR : B.AIR);
    set(16, y, d, B.GLASS_PANE);                                                          // the outside wall is glass
    const stop = stops.find((s) => y === s || y === s + 1);
    const slab = floors.includes(y) && y > F || y === roof;
    set(14, y, d, stop !== undefined ? B.AIR : slab ? B.SMOOTH_STONE : B.GLASS_PANE);
  }
  for (let y = F; y <= top; y++) {
    const slab = floors.includes(y) && y > F || y === roof;
    for (const a of [14, 15, 16]) { set(a, y, 9, slab ? B.SMOOTH_STONE : B.GLASS_PANE); set(a, y, 12, slab || y < roof ? (a === 15 && !slab ? B.GLASS_PANE : B.PLASTER) : B.GLASS_PANE); }
  }
  for (const d of [10, 11]) set(15, F - 1, d, B.LIFT_FLOOR);
  for (const s of stops) placeADoors(W, [10, 11].map((d) => [x0 + 14, Z(d)]), s, fromA);
  // the lift's roof, with a light over the cabin
  for (let a = 14; a <= 16; a++) for (let d = 9; d <= 12; d++) set(a, top + 1, d, a === 15 && (d === 10 || d === 11) ? B.GLOWSTONE : B.SMOOTH_STONE);

  // ---- roof garden café ----
  for (let a = 5; a <= 12; a++) for (let d = 2; d <= 10; d++) set(a, roof, d, B.DECK);
  for (const [a, d] of [[5, 2], [12, 2], [5, 10], [12, 10]]) { set(a, roof, d, B.PODZOL); set(a, roof + 1, d, B.BUSH); }
  for (let a = 6; a <= 11; a++) { set(a, roof, 1, B.PODZOL); set(a, roof + 1, 1, (a & 1) ? B.TULIP : B.BUSH); }
  for (const [a, d] of [[7, 5], [10, 5], [7, 8], [10, 8]]) {
    set(a, roof + 1, d, B.TABLE, 0);
    set(a - 1, roof + 1, d, B.CHAIR, toA); set(a + 1, roof + 1, d, B.CHAIR, fromA);
  }
  // a pergola beam with lanterns hanging from it
  for (const a of [5, 12]) for (let y = roof + 1; y <= roof + 3; y++) set(a, y, 6, B.DARK_OAK_FENCE);
  for (let a = 5; a <= 12; a++) set(a, roof + 4, 6, B.DARK_OAK_FENCE);
  for (const a of [6, 8, 9, 11]) set(a, roof + 3, 6, B.LANTERN, 8);
}

// ---------------------------------------------------------------- Galeries STUCOM ----
// Under the west half of the square, level with the metro landing it opens off: a terrazzo
// arcade (u -12..-10) with shops either side behind glass fronts and lit signs. West: the
// SuperBloc supermarket and Mobles Blocklands. East: Forn Can Pau (bakery), the car showroom and a
// kiosk. The shop logic (shopkeepers, tills, catalogues, the cars on show) is in shops.js.
const MALL_SHOPS = [
  { key: 'super', u0: -21, v0: -14, u1: -14, v1: -1, front: -13, door: [-8, -7], keeper: [-15, -4], till: [-15, -3], color: 14 },
  { key: 'mobles', u0: -21, v0: 1, u1: -14, v1: 14, front: -13, door: [7, 8], keeper: [-15, 12], till: [-15, 13], color: 1 },
  { key: 'forn', u0: -8, v0: -14, u1: -4, v1: -7, front: -9, door: [-11, -10], keeper: [-5, -12], till: [-6, -12], color: 12 },
  { key: 'cotxes', u0: -8, v0: -5, u1: -4, v1: 5, front: -9, door: [-1, 0], keeper: [-5, 4], till: [-6, 4], color: 15 },
  { key: 'quiosc', u0: -8, v0: 11, u1: -4, v1: 14, front: -9, door: [12, 13], keeper: [-5, 13], till: [-6, 13], color: 3 },
];
function buildMall(W, g, D) {
  const { cx, cz, P } = D;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  const U0 = -22, U1 = -3, V0 = -15, V1 = 15, Y0 = P - 1, Y1 = P + 5;
  if (!rectHits(W, cx + U0 - 1, cz + V0 - 1, cx + U1 + 1, cz + V1 + 1)) return;
  const shopAt = (u, v) => MALL_SHOPS.find((s) => u >= s.u0 && u <= s.u1 && v >= s.v0 && v <= s.v1);
  const FLOORS = { super: B.CONCRETE, mobles: B.PLANKS, forn: B.TERRACOTTA_C + 2, cotxes: B.POLISHED_ANDESITE, quiosc: B.CONCRETE + 8 };
  // shell, floors, ceiling with lights
  for (let u = U0 - 1; u <= U1; u++) for (let v = V0 - 1; v <= V1 + 1; v++) for (let y = Y0 - 1; y <= Y1 + 1; y++) {
    const outer = u === U0 - 1 || v === V0 - 1 || v === V1 + 1 || u === U1 || y === Y0 - 1 || y === Y1 + 1;
    const s = shopAt(u, v);
    let id = B.AIR;
    if (outer) id = B.CONCRETE + 7;
    else if (u === U0 || v === V0 || v === V1) id = y === P + 1 ? B.CONCRETE + 8 : B.CONCRETE;
    else if (y === Y0) id = s ? FLOORS[s.key] : ((u + v) & 1) ? B.TERRAZZO : B.QUARTZ_BLOCK || B.TERRAZZO;
    else if (y === Y1) id = (u % 3 === 0 && v % 3 === 0) ? B.GLASS_LAMP : B.CONCRETE;
    else if (!s && !(u >= -12 && u <= -10) && !(v >= 7 && v <= 9 && u > -10)) id = B.CONCRETE;   // walls between shops
    set(u, y, v, id);
  }
  // shop fronts: glass, a door opening, the fascia with the lit sign
  for (const s of MALL_SHOPS) {
    const out = s.front > s.u1 ? 0 : 1;                 // the way the front faces (towards the arcade)
    for (let v = s.v0; v <= s.v1; v++) for (let y = P; y <= P + 4; y++) {
      const door = v >= s.door[0] && v <= s.door[1] && y <= P + 1;
      set(s.front, y, v, door ? B.AIR : y <= P + 2 ? B.GLASS_PANE : B.CONCRETE + s.color);
    }
    const len = Math.min(4, s.v1 - s.v0 + 1), mid = Math.floor((s.v0 + s.v1) / 2);
    const signU = s.front + (out === 0 ? 1 : -1);
    set(signU, P + 3, mid, B.AIR);
    // pictures run towards -v when facing +u and towards +v when facing -u
    const anchor = out === 0 ? mid + Math.floor(len / 2) : mid - Math.floor(len / 2) + (len % 2 ? 0 : 1);
    W.pic(cx + signU, P + 3, cz + anchor, out, len, 1, 'shop_' + s.key);
    // the till on a counter, the keeper's stool behind it
    set(s.till[0], P, s.till[1], B.KITCHEN_COUNTER, out);
    set(s.till[0], P + 1, s.till[1], B.CASH_REGISTER, out === 0 ? 1 : 0);
  }
  // the passage from the metro landing, with a sign
  for (let v = 7; v <= 9; v++) for (let y = P; y <= P + 2; y++) { if (y <= P + 1) set(-2, y, v, B.AIR); set(U1, y, v, B.AIR); }
  for (let v = 7; v <= 9; v++) set(-2, P - 1, v, B.TERRAZZO);
  W.pic(cx - 1, P + 3, cz + 10 - 1, 5, 3, 1, 'shop_galeries');
  // ---- SuperBloc ----
  for (let v = -13; v <= -3; v++) for (const y of [P, P + 1]) set(-21, y, v, B.SHELF_GROCERY, 1);
  for (let v = -12; v <= -6; v++) for (const y of [P, P + 1]) { set(-18, y, v, B.SHELF_GROCERY, 0); set(-17, y, v, v & 1 ? B.SHELF_BREAD : B.SHELF_GROCERY, 1); }
  for (let u = -20; u <= -15; u++) for (const y of [P, P + 1]) set(u, y, -14, B.SHELF_DRINKS, 5);
  for (let u = -16; u <= -15; u++) set(u, P, -3, B.KITCHEN_COUNTER, 4);
  set(-16, P + 1, -3, B.AIR);
  // ---- Mobles Blocklands: a showroom of rooms ----
  const M = (u, v, id, f) => set(u, P, v, id, f);
  M(-21, 3, B.SOFA_RED, 1); M(-21, 4, B.SOFA_RED, 1); M(-21, 5, B.SOFA_RED, 1); M(-19, 4, B.COFFEE_TABLE, 1);
  for (let u = -20; u <= -18; u++) for (let v = 3; v <= 5; v++) if (!(u === -19 && v === 4)) M(u, v, B.RUG_RED, 0);
  M(-21, 7, B.TV_ON, 1); M(-21, 9, B.FLOOR_LAMP, 0);
  M(-21, 11, B.DOUBLE_BED_HEAD, 1); M(-21, 12, B.DOUBLE_BED_HEAD, 1 | 8); M(-20, 11, B.DOUBLE_BED, 1); M(-20, 12, B.DOUBLE_BED, 1 | 8);
  M(-17, 11, B.TABLE, 0); M(-17, 12, B.TABLE, 0); M(-16, 11, B.CHAIR, 0); M(-16, 12, B.CHAIR, 0); M(-18, 11, B.CHAIR, 1); M(-18, 12, B.CHAIR, 1);
  M(-17, 2, B.BATHTUB, 4); M(-16, 2, B.TOILET, 4); M(-15, 2, B.WASHER, 4);
  set(-21, P + 2, 4, B.PAINTING_SEA, 1); set(-21, P + 2, 12, B.PAINTING_FLOWERS, 1); set(-17, P + 4, 11, B.CEILING_LAMP, 0); set(-19, P + 4, 4, B.CEILING_LAMP, 0);
  // ---- Forn Can Pau ----
  for (let v = -13; v <= -8; v++) for (const y of [P, P + 1]) set(-4, y, v, B.SHELF_BREAD, 0);
  set(-6, P, -13, B.KITCHEN_COUNTER, 1); set(-6, P, -11, B.KITCHEN_COUNTER, 1); set(-6, P, -10, B.KITCHEN_COUNTER, 1);
  set(-4, P + 3, -14, B.LANTERN, 8);
  // ---- the car showroom: the cars on show are placed by shops.js; a turntable floor and posters ----
  for (let u = -8; u <= -4; u++) for (let v = -5; v <= 3; v++) if (Math.hypot(u + 6, v + 1) < 2.6) set(u, P - 1, v, B.CONCRETE + 15);
  set(-6, P, 4, B.KITCHEN_COUNTER, 1); set(-4, P, 5, B.FLOOR_LAMP, 0);
  // ---- kiosk: papers and drinks ----
  for (let v = 11; v <= 14; v++) set(-4, P, v, v & 1 ? B.SHELF_DRINKS : B.SHELF_GROCERY, 0);
  // benches and plants along the arcade
  for (const v of [-13, -4, 4, 12]) { set(-11, P, v, B.PODZOL); set(-11, P + 1, v, B.BUSH); }
  for (const v of [-9, 0, 10]) { set(-12, P, v, shapeId('oak', 'stairs'), 1); set(-10, P, v, shapeId('oak', 'stairs'), 0); }
}

// ---------------------------------------------------------------- bus stops ----
// Where the buses stop (u, v: the kerb-side lane point the bus stops at) and where the shelter
// stands: back row at (su, sv), the road towards rd. Line 1 goes round the square, line 2 round
// the outer ring road, both with the square on their right.
const BUS_STOPS = [
  { line: 1, name: 'STUCOM', u: 0, v: -23, su: 0, sv: -19, rd: [0, -1] },
  { line: 1, name: 'Banc Central', u: 22, v: 0, su: 18, sv: 0, rd: [1, 0] },
  { line: 1, name: 'Plaça Universitat', u: 11, v: 22, plaza: true },
  { line: 1, name: 'Camp de Futbol', u: -23, v: -1, su: -19, sv: -1, rd: [-1, 0] },
  { line: 2, name: 'Escola · darrere', u: 0, v: -69, su: 0, sv: -65, rd: [0, -1] },
  { line: 2, name: 'Solars Est', u: 68, v: 0, su: 64, sv: 0, rd: [1, 0] },
  { line: 2, name: 'Parc de Catalunya', u: 0, v: 68, su: 0, sv: 64, rd: [0, 1] },
  { line: 2, name: 'Solars Oest', u: -69, v: 0, su: -65, sv: 0, rd: [-1, 0] },
];
function buildBusShelter(W, g, D, st) {
  const { cx, cz, F } = D;
  const set = (u, v, y, id, f) => W.set(cx + u, y, cz + v, id, f);
  const al = [st.rd[1] !== 0 ? 1 : 0, st.rd[0] !== 0 ? 1 : 0];            // along the street
  const face = (d) => (d[0] > 0 ? 0 : d[0] < 0 ? 1 : d[1] > 0 ? 4 : 5);
  const toGlass = face([-st.rd[0], -st.rd[1]]), toRoad = face(st.rd);
  for (let k = -2; k <= 2; k++) for (let r = 0; r <= 1; r++) {
    const u = st.su + al[0] * k + st.rd[0] * r, v = st.sv + al[1] * k + st.rd[1] * r;
    for (let y = F; y <= F + 3; y++) set(u, v, y, B.AIR);
    set(u, v, F - 1, B.PANOT);
    if (r === 0) { const edge = Math.abs(k) === 2; set(u, v, F, edge ? B.IRON_BARS : B.GLASS_PANE); set(u, v, F + 1, edge ? B.IRON_BARS : B.GLASS_PANE); }
    else if (Math.abs(k) <= 1) set(u, v, F, shapeId('oak', 'stairs'), toGlass);
    set(u, v, F + 2, B.CONCRETE_SLAB, 8);
  }
  // the timetable inside, the pole with the sign at the kerb
  W.pic(cx + st.su + st.rd[0], F + 1, cz + st.sv + st.rd[1], toRoad, 1, 1, 'bus_line' + st.line);
  const pu = st.su + al[0] * 3 + st.rd[0], pv = st.sv + al[1] * 3 + st.rd[1];
  for (let y = F; y <= F + 1; y++) set(pu, pv, y, B.IRON_BARS);
  set(pu, pv, F + 2, B.CONCRETE + (st.line === 1 ? 14 : 11));
  W.pic(cx + pu + st.rd[0], F + 2, cz + pv + st.rd[1], toRoad, 1, 1, 'bus');
}

// ---------------------------------------------------------------- the airport ----
// East of the district, on levelled ground: an access road from the ring road, a car park, the
// terminal (glass on both long sides, check-in desks with tills, departure boards, gate seating),
// the apron, a 7-wide runway along z with markings and edge lights, a control tower with a lift
// and a windsock. The planes and the flights are in airport.js.
function buildAirport(W, g, D) {
  const { cx, cz, F } = D;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  const U0 = 74, U1 = 128, V0 = -60, V1 = 60;
  if (!rectHits(W, cx + U0, cz + V0 - 14, cx + U1 + 14, cz + V1 + 14)) return;
  // the embankment round it: slopes back to the natural ground over 14 blocks
  for (let u = U0; u <= U1 + 14; u++) for (let v = V0 - 14; v <= V1 + 14; v++) {
    if (u <= U1 && v >= V0 && v <= V1) continue;
    const x = cx + u, z = cz + v;
    if (!W.has(x, z)) continue;
    const du = Math.max(0, u - U1), dv = Math.max(0, V0 - v, v - V1), d = Math.hypot(du, dv);
    if (d > 14 || (u < 90 && dv > 0 && u < U0 + 2)) continue;
    const h = g.height(x, z), k = smoothstep(0, 14, d), top = Math.round(F - 1 + (h - (F - 1)) * k);
    for (let y = Math.min(h, top) - 3; y <= top; y++) if (y > 0 && (y > h || !BLOCK_SOLID[W.get(x, y, z)])) W.set(x, y, z, y === top ? B.GRASS : B.DIRT);
    if (top < h) for (let y = top + 1; y <= h + 12 && y < CH; y++) W.set(x, y, z, B.AIR);
    else W.set(x, top, z, B.GRASS);
  }
  // level ground
  for (let u = U0; u <= U1; u++) for (let v = V0; v <= V1; v++) {
    const x = cx + u, z = cz + v;
    if (!W.has(x, z)) continue;
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 8); y <= F - 2; y++) if (y > 0 && (y > h || !BLOCK_SOLID[W.get(x, y, z)])) W.set(x, y, z, y >= F - 4 ? B.DIRT : B.STONE);
    for (let y = F; y <= Math.max(h, F) + 30 && y < CH; y++) W.set(x, y, z, B.AIR);
    let top = B.GRASS;
    if (u <= 87 && Math.abs(v) <= 2) top = Math.abs(v) === 2 ? B.ROAD_WHITE : B.ASPHALT;                       // access road
    if (u >= 82 && u <= 87 && v >= 4 && v <= 16) top = (v % 3 === 0) ? B.ROAD_WHITE : B.ASPHALT;              // car park
    if (u >= 101 && u <= 116 && Math.abs(v) <= 26) top = B.CONCRETE + 8;                                     // apron
    if (u >= 101 && u <= 116 && Math.abs(v) <= 26 && (u === 110 && v % 2 === 0)) top = B.CONCRETE + 4;       // lead-in line
    if (u >= 117 && u <= 123) {                                                                               // runway
      top = B.ASPHALT;
      if (u === 117 || u === 123) top = B.ROAD_WHITE;
      else if (u === 120 && ((v + 60) % 8) < 4) top = B.ROAD_WHITE;
      if (Math.abs(v) >= 52 && u !== 120 && u % 2 === 0) top = B.ROAD_WHITE;                                // threshold bars
    }
    if ((u === 116 || u === 124) && v % 6 === 0 && Math.abs(v) <= 58) top = B.GLASS_LAMP;                     // edge lights
    if (u >= 101 && u <= 116 && v > 26 && v <= 50 && u >= 112) top = B.ASPHALT;                               // taxiway to the runway end
    W.set(x, F - 1, z, top);
  }
  // ---- terminal: u 88..100, v -14..14, F..F+7 ----
  for (let u = 88; u <= 100; u++) for (let v = -14; v <= 14; v++) {
    const edge = u === 88 || u === 100 || Math.abs(v) === 14;
    set(u, F - 1, v, edge ? B.CONCRETE + 7 : ((u + v) & 1 ? B.TERRAZZO : B.QUARTZ_BLOCK));
    for (let y = F; y <= F + 7; y++) {
      let id = B.AIR;
      if (edge) {
        const glassSide = u === 88 || u === 100;
        id = glassSide ? (y === F + 7 || v % 4 === 0 ? B.CONCRETE : B.GLASS_PANE) : B.CONCRETE;
      }
      set(u, y, v, id);
    }
    set(u, F + 8, v, (u % 3 === 0 && v % 3 === 0 && !edge) ? B.GLASS_LAMP : B.CONCRETE);
  }
  // roof overhang on both sides
  for (let v = -16; v <= 16; v++) { for (const u of [86, 87, 101, 102]) set(u, F + 8, v, B.CONCRETE_SLAB, 8); }
  // entrance (landside) and the gate (airside): automatic doors
  for (const u of [88, 100]) { for (let v = -2; v <= 2; v++) for (let y = F; y <= F + 1; y++) set(u, y, v, B.AIR); }
  placeADoors(W, [-1, 0, 1].map((v) => [cx + 88, cz + v]), F, 1);
  placeADoors(W, [-1, 0, 1].map((v) => [cx + 100, cz + v]), F, 0);
  for (const u of [88, 100]) for (const v of [-2, 2]) { set(u, F, v, B.CONCRETE); set(u, F + 1, v, B.CONCRETE); }
  // check-in: counters with tills along u = 92, the queue ropes, the boards
  for (let v = -11; v <= -4; v++) { set(92, F, v, B.KITCHEN_COUNTER, 1); if (v % 2 === 0) set(92, F + 1, v, B.CASH_REGISTER, 0); }
  for (let v = -11; v <= -4; v++) set(93, F, v, B.AIR);
  for (let v = 4; v <= 11; v++) set(92, F, v, B.KITCHEN_COUNTER, 1);
  set(92, F + 1, 6, B.CASH_REGISTER, 0); set(92, F + 1, 9, B.CASH_REGISTER, 0);
  W.pic(cx + 89, F + 4, cz + 3, 0, 4, 2, 'airport_board');
  W.pic(cx + 99, F + 4, cz - 3, 1, 4, 2, 'airport_board');
  // gate seating by the airside glass
  for (const v of [-11, -10, -9, -7, -6, -5, 5, 6, 7, 9, 10, 11]) for (const u of [96, 98]) set(u, F, v, B.SEAT_BLUE, u === 96 ? 0 : 1);
  for (const [u, v] of [[90, -13], [90, 13], [99, -13], [99, 13]]) { set(u, F, v, B.PODZOL); set(u, F + 1, v, B.BUSH); }
  for (const [u, v] of [[94, -2], [94, 2]]) { set(u, F, v, B.VENDING_MACHINE, 1); }
  // the name over the entrance
  W.pic(cx + 87, F + 5, cz - 3, 1, 6, 2, 'airport_sign');
  // ---- control tower: u 90..92, v 18..20, cab on top, a lift inside ----
  const TT = F + 16;
  for (let u = 89; u <= 93; u++) for (let v = 17; v <= 21; v++) {
    const inner = u >= 90 && u <= 92 && v >= 18 && v <= 20;
    const core = u === 91 && v === 19;
    for (let y = F - 1; y <= TT + 4; y++) {
      let id = B.AIR;
      if (y < TT) {
        if (!inner) continue;
        const wall = u === 90 || u === 92 || v === 18 || v === 20;
        id = core ? (y === F - 1 || y === TT - 1 ? B.LIFT_FLOOR : B.AIR) : wall ? ((y - F) % 5 === 2 ? B.GLASS_PANE : B.CONCRETE) : B.AIR;
        if (u === 90 && v === 19 && (y === F || y === F + 1)) id = B.AIR;   // door
      } else if (y === TT) id = core ? B.LIFT_FLOOR : B.CONCRETE + 8;
      else if (y <= TT + 3) id = (u === 89 || u === 93 || v === 17 || v === 21) ? B.GLASS_PANE : B.AIR;
      else id = B.CONCRETE + 7;
      set(u, y, v, id);
    }
  }
  for (let y = F; y < TT; y++) set(91, y, 19, B.AIR);
  set(91, F - 1, 19, B.LIFT_FLOOR); set(91, TT, 19, B.LIFT_FLOOR);
  set(90, TT + 1, 18, B.DESKTOP_PC, 1); set(92, TT + 1, 20, B.DESKTOP_PC, 0); set(90, TT + 1, 20, B.CHAIR, 0);
  for (let u = 89; u <= 93; u++) for (let v = 17; v <= 21; v++) set(u, TT + 5, v, (u + v) % 2 ? B.CONCRETE + 14 : B.CONCRETE);
  // windsock
  for (let y = F; y <= F + 4; y++) set(126, y, -34, B.IRON_BARS);
  set(126, F + 4, -35, B.WOOL + 1); set(126, F + 4, -36, B.WOOL); set(126, F + 4, -37, B.WOOL + 1);
}
