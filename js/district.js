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
const DHALF = 74, DBLEND = 18, DOUT = DHALF + DBLEND;
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
  const D = { cx, cz, F, P: F - METRO_DEPTH, furn: [] };
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

  // ---- the four corner blocks: free building plots ----
  for (const i of [-1, 1]) for (const j of [-1, 1]) {
    const u0 = i * DP - DI / 2, v0 = j * DP - DI / 2;
    piece(box(u0, v0, u0 + DI - 1, v0 + DI - 1), (W) => buildPlotBlock(W, g, D, u0, v0));
  }

  // ---- the metro, last: nothing is ever built over its stairs ----
  const tx = cx + 12, at = (v) => [tx + 0.5, D.P - 1, cz + v + 0.5];
  piece(box(-5, -18, 16, 60), (W) => buildDistrictMetro(W, g, D));
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
    const e = Math.max(-DHALF - u, u - (DHALF - 1), -DHALF - v, v - (DHALF - 1), 0);
    if (e > 0) {
      const t = Math.min(1, e / DBLEND), s = t * t * (3 - 2 * t);
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
// Universitat under the square, a straight tunnel and Catalunya under the park. The track runs
// along z at u = 12, the platform on its west side. Each station has a wide stair from the street
// (open at the top, with railings, a glass canopy and the red M) down to a landing that opens onto
// the platform.
function buildDistrictMetro(W, g, D) {
  const { cx, cz, F, P } = D;
  const set = (u, y, v, id, f) => W.set(cx + u, y, cz + v, id, f);
  const L = { X: (a) => cx + a, Z: (a, d) => cz + d };
  const S = lwriter(W, L);
  const hall = (v0, v1, stripe, mouth) => {
    const vb = mouth === v0 ? v1 - 1 : v0 + 1;      // buffer stop at the closed end
    for (let u = 3; u <= 14; u++) for (let v = v0; v <= v1; v++) {
      const endWall = v === v0 || v === v1, open = u >= 11 && u <= 13 && v === mouth;
      const wall = u === 3 || u === 14 || (endWall && !open);
      for (let y = P - 3; y <= P + 6; y++) {
        let id = B.AIR;
        if (y === P + 6) id = B.CONCRETE;
        else if (y === P + 5) id = !wall && (u + v) % 4 === 0 ? B.GLASS_LAMP : B.CONCRETE + 8;
        else if (wall) id = y === P + 1 ? stripe : y < P - 1 ? B.CONCRETE + 7 : B.CONCRETE;
        else if (y === P - 1) id = u <= 10 ? (u === 10 ? B.CONCRETE + 4 : B.TERRAZZO) : u === 12 && (mouth === v1 ? v > vb && v <= v1 : v >= v0 && v < vb) ? B.RAIL : B.AIR;
        else if (y === P - 2) id = u >= 11 ? B.GRAVEL : B.CONCRETE + 7;
        else if (y < P - 2) id = B.CONCRETE + 7;
        set(u, y, v, id);
      }
    }
    for (let u = 11; u <= 13; u++) { set(u, P - 1, vb, B.CONCRETE + 15); set(u, P, vb, B.CONCRETE + 14); }
  };
  hall(-16, 12, B.BLUE_TILES, 12);
  hall(31, 58, B.CONCRETE + 14, 31);
  // the trains know a platform by the marker under its track (metro_panel.js)
  for (const [m0, m1] of [[-14, 11], [31, 56]]) for (let v = m0; v <= m1; v++) set(12, P - 2, v, B.METRO_MARK);
  set(3, P + 1, -7, B.METRO_PANEL, 0);
  set(3, P + 1, 42, B.METRO_PANEL, 0);
  // tunnel between them: walls, a vault, lamps, the track
  for (let v = 13; v <= 30; v++) for (let u = 10; u <= 14; u++) for (let y = P - 3; y <= P + 4; y++) {
    const wall = u === 10 || u === 14, roof = y === P + 4 || (y === P + 3 && (u === 11 || u === 13));
    let id = B.AIR;
    if (y <= P - 2) id = y === P - 2 && !wall ? B.GRAVEL : B.CONCRETE + 7;
    else if (wall || roof) id = y === P ? B.BLUE_TILES : B.CONCRETE + 8;
    else if (y === P + 3 && u === 12) id = v % 8 === 4 ? B.GLASS_LAMP : B.CONCRETE + 8;
    else if (y === P - 1 && u === 12) id = B.RAIL;
    set(u, y, v, id);
  }
  // platform furniture: columns, benches against the wall, signs, map, a ticket machine
  for (const [v0, v1, name, stripe, benches] of [[-16, 12, 'metro_name', B.BLUE_TILES, [-9, -8, 3, 4]], [31, 58, 'metro_name2', B.CONCRETE + 14, [45, 46, 50, 51]]]) {
    for (let v = v0 + 5; v < v1 - 3; v += 7) for (let y = P; y <= P + 4; y++) set(7, y, v, y === P + 1 ? stripe : B.QUARTZ_PILLAR);
    for (const v of benches) set(4, P, v, shapeId('oak', 'stairs'), 1);
    S.pic(13, P + 2, v0 + 6, 1, 3, 1, name, true);
    S.pic(13, P + 2, v1 - 10, 1, 3, 1, name, true);
    S.pic(13, P + 1, v0 + 16, 1, 2, 1, v0 < 0 ? 'sunset' : 'mountains', true);
    S.pic(4, P + 1, v0 + 3, 0, 2, 1, 'metro_map', true);
    S.pic(4, P + 2, v0 + 12, 0, 1, 1, 'metro', true);
    set(4, P, v0 + 1, B.VENDING_MACHINE, 0);
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
