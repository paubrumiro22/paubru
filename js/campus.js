'use strict';
// The STUCOM campus: everything around the school in the STUCOM village (structures.js calls
// planCampus from decorateStucom once the school and the free plots are placed). A forecourt with
// trees, benches and lamps, an annex with the cafeteria, library and computer room, a football
// pitch with stands and floodlights, a garden with a fountain, a bus stop by the road and the
// entrance to the "Universitat" metro station with its platform and track underground. Students
// and teachers live here. Loaded in the chunk workers too (data-w): only deterministic code.

const OPP = { 0: 1, 1: 0, 4: 5, 5: 4 };
const PIC_NORMAL = { 0: [1, 0, 0], 1: [-1, 0, 0], 4: [0, 0, 1], 5: [0, 0, -1] };

// A local frame for a rectangular building whose front edge faces f (0 +x, 1 -x, 4 +z, 5 -z):
// a runs along the front (0..Wd-1), d goes inwards from the front row (0..D-1).
function lframe(ox, oz, Wd, D, f) {
  const X = (a, d) => (f === 5 ? ox + a : f === 4 ? ox + Wd - 1 - a : f === 1 ? ox + d : ox + D - 1 - d);
  const Z = (a, d) => (f === 5 ? oz + d : f === 4 ? oz + D - 1 - d : f === 1 ? oz + Wd - 1 - a : oz + a);
  const along = f === 5 ? 0 : f === 4 ? 1 : f === 1 ? 5 : 4;      // facing towards +a
  const sx = f === 4 || f === 5 ? Wd : D, sz = f === 4 || f === 5 ? D : Wd;
  return { X, Z, out: f, inw: OPP[f], along, back: OPP[along], box: [ox, oz, ox + sx - 1, oz + sz - 1] };
}
// Writer helpers in a frame: set, fill a box, a picture on a wall (facing out or in).
function lwriter(W, L) {
  return {
    set(a, y, d, id, f) { W.set(L.X(a, d), y, L.Z(a, d), id, f); },
    get(a, y, d) { return W.get(L.X(a, d), y, L.Z(a, d)); },
    fill(a0, y0, d0, a1, y1, d1, id, f) { for (let a = a0; a <= a1; a++) for (let d = d0; d <= d1; d++) for (let y = y0; y <= y1; y++) W.set(L.X(a, d), y, L.Z(a, d), id, f); },
    // a picture facing f, w wide from (a0, d0) along a (or along d), hung in that air cell; the
    // anchor is its bottom-left corner as seen by someone looking at it
    pic(a0, y, d0, f, w, h, name, alongD) {
      const n = PIC_NORMAL[f], right = [n[2], -n[0]];
      let best = null, bv = Infinity;
      for (let i = 0; i < w; i++) {
        const a = alongD ? a0 : a0 + i, d = alongD ? d0 + i : d0;
        const x = L.X(a, d), z = L.Z(a, d), v = x * right[0] + z * right[1];
        if (v < bv) { bv = v; best = [x, z]; }
      }
      W.pic(best[0], y, best[1], f, w, h, name);
    },
  };
}

// ---- small street furniture (world coordinates) ----
function campusLamp(W, x, y, z) {
  if (!W.has(x, z)) return;
  for (let k = 0; k < 4; k++) W.set(x, y + k, z, B.BLACKSTONE_WALL);
  W.set(x, y + 4, z, B.GLASS_LAMP);
}
function campusTree(W, x, y, z, kind, h = 4) {
  const log = kind === 'cherry' ? B.CHERRY_LOG : kind === 'birch' ? B.BIRCH_LOG : B.LOG;
  const leaf = kind === 'cherry' ? B.CHERRY_LEAVES : kind === 'birch' ? B.BIRCH_LEAVES : B.LEAVES;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 2; dy++) {
    const r = dx * dx + dz * dz + dy * dy * 1.6;
    if (r > 5.2 || (dy === 2 && r > 2.5)) continue;
    const X = x + dx, Z = z + dz, Y = y + h - 1 + dy;
    if (W.has(X, Z) && W.get(X, Y, Z) === B.AIR) W.set(X, Y, Z, leaf);
  }
  if (W.has(x, z)) for (let k = 0; k < h; k++) W.set(x, y + k, z, log);
}
// the ground under a campus piece: flat at F-1 with `top`, air above up to F+clear
function campusGround(W, g, x0, z0, x1, z1, F, top, clear, base = B.DIRT) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (!W.has(x, z)) continue;
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y < F - 1; y++) if (y > 0) W.set(x, y, z, base);
    W.set(x, F - 1, z, typeof top === 'function' ? top(x, z) : top);
    for (let y = F; y <= F + clear; y++) W.set(x, y, z, B.AIR);
  }
}

// ---- planning ----
function planCampus(g, plan, st, rough) {
  const cx = plan.x, cz = plan.z;
  const zones = plan.zones;
  const roadCells = new Set();
  for (const [dx, dz, len] of plan.roadDirs || []) for (let t = 0; t <= len + 1; t++) for (let w = -2; w <= 2; w++) roadCells.add((cx + dx * t + (dz ? w : 0)) * 100003 + cz + dz * t + (dx ? w : 0));
  for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) roadCells.add((cx + dx) * 100003 + cz + dz);
  const freeRect = (x0, z0, x1, z1, pad = 2) => {
    if (zones.some((r) => x1 + pad >= r[0] && x0 - pad <= r[2] && z1 + pad >= r[1] && z0 - pad <= r[3])) return false;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (roadCells.has(x * 100003 + z)) return false;
    return true;
  };
  // nearest free, flat enough spot for a Wd x D piece
  const site = (Wd, D, rMin, rMax, maxRough) => {
    for (let r = rMin; r <= rMax; r += 4) {
      const n = Math.max(8, Math.round(r / 3));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r * 0.37;
        const mx = Math.round(cx + Math.cos(a) * r), mz = Math.round(cz + Math.sin(a) * r);
        {
          // the orientation facing the square; the footprint swaps for x-facing fronts
          const f0 = Math.abs(mx - cx) > Math.abs(mz - cz) ? (mx > cx ? 1 : 0) : (mz > cz ? 5 : 4);
          const sx = f0 === 4 || f0 === 5 ? Wd : D, sz = f0 === 4 || f0 === 5 ? D : Wd;
          const x0 = mx - (sx >> 1), z0 = mz - (sz >> 1), x1 = x0 + sx - 1, z1 = z0 + sz - 1;
          if (Math.hypot(Math.max(Math.abs(x0 - cx), Math.abs(x1 - cx)), Math.max(Math.abs(z0 - cz), Math.abs(z1 - cz))) > STRUCT_REACH - 6) continue;
          if (!freeRect(x0, z0, x1, z1)) continue;
          if (rough(x0, z0, x1, z1) > maxRough) continue;
          const F = g.height(mx, mz) + 1;
          return { x0, z0, x1, z1, f: f0, F };
        }
      }
    }
    return null;
  };
  const add = (s, pad, build) => {
    zones.push([s.x0, s.z0, s.x1, s.z1]);
    plan.pieces.push({ box: [s.x0 - pad, s.z0 - pad, s.x1 + pad, s.z1 + pad], build });
  };
  const student = (x, y, z) => plan.spawns.push({ kind: 'villager', prof: 'student', x: x + 0.5, y, z: z + 0.5 });
  const teacher = (x, y, z) => plan.spawns.push({ kind: 'villager', prof: 'teacher', x: x + 0.5, y, z: z + 0.5 });

  // the forecourt of the school was reserved by decorateStucom (last-but-one zone pushed there)
  const fc = plan.stucomForecourt;
  if (fc) plan.pieces.push({ box: fc.rect, build: (W) => buildForecourt(W, g, fc) });
  if (fc) { student(fc.X(4, -4), fc.F, fc.Z(4, -4)); student(fc.X(12, -5), fc.F, fc.Z(12, -5)); teacher(fc.X(8, 5), fc.F, fc.Z(8, 5)); }

  // annex: cafeteria downstairs, library and computer room upstairs
  const campus = plan.campus = {};
  const an = campus.annex = site(15, 11, 16, 80, 5);
  if (an) {
    const L = lframe(an.x0, an.z0, 15, 11, an.f);
    add(an, 2, (W) => buildAnnex(W, g, L, an.F));
    student(L.X(4, 4), an.F, L.Z(4, 4)); student(L.X(10, 5), an.F, L.Z(10, 5));
    student(L.X(3, 5), an.F + 5, L.Z(3, 5)); student(L.X(10, 3), an.F + 5, L.Z(10, 3));
    teacher(L.X(11, 7), an.F + 5, L.Z(11, 7));
  }
  // football pitch with stands and floodlights
  const pt = campus.pitch = site(30, 22, 24, 92, 7);
  if (pt) {
    const L = lframe(pt.x0, pt.z0, 30, 22, pt.f);
    add(pt, 1, (W) => buildPitch(W, g, L, pt.F));
    student(L.X(8, 8), pt.F, L.Z(8, 8)); student(L.X(20, 10), pt.F, L.Z(20, 10)); student(L.X(14, 5), pt.F, L.Z(14, 5));
    student(L.X(6, 19), pt.F + 1, L.Z(6, 19));
  }
  // garden with a fountain
  const gd = campus.garden = site(13, 13, 14, 70, 4);
  if (gd) {
    add(gd, 1, (W) => buildGarden(W, g, gd.x0, gd.z0, gd.F));
    student(gd.x0 + 3, gd.F, gd.z0 + 6); student(gd.x0 + 9, gd.F, gd.z0 + 7);
  }
  // the metro: a stair entrance near the square and the station underneath
  const mt = campus.metro = site(5, 9, 10, 46, 3);
  if (mt) {
    const L = lframe(mt.x0, mt.z0, 5, 9, mt.f);
    // the station hall runs on beyond the stairs, deep under whatever is there
    const hall = [];
    for (const [a, d] of [[-4, 8], [8, 8], [-4, 26], [8, 26]]) hall.push([L.X(a, d), L.Z(a, d)]);
    const hx0 = Math.min(...hall.map((p) => p[0])), hx1 = Math.max(...hall.map((p) => p[0]));
    const hz0 = Math.min(...hall.map((p) => p[1])), hz1 = Math.max(...hall.map((p) => p[1]));
    zones.push([mt.x0, mt.z0, mt.x1, mt.z1]);
    plan.pieces.push({ box: [Math.min(hx0, mt.x0) - 1, Math.min(hz0, mt.z0) - 1, Math.max(hx1, mt.x1) + 1, Math.max(hz1, mt.z1) + 1], build: (W) => buildMetro(W, g, L, mt.F) });
    plan.metro = { x: L.X(2, 17), z: L.Z(2, 17), y: mt.F - 8 };
  }
  // bus stop at the side of a road, a little way out of the square
  for (const [dx, dz, len] of plan.roadDirs || []) {
    let done = false;
    for (const side of [1, -1]) {
      const t = Math.min(len - 3, 20);
      const px = cx + dx * t, pz = cz + dz * t;
      // shelter: 5 along the road, 2 deep, 3..4 blocks off the centre line
      const ox = dz * side, oz = dx * side;
      const cells = [];
      for (let u = -2; u <= 2; u++) for (let v = 3; v <= 4; v++) cells.push([px + dx * u + ox * v, pz + dz * u + oz * v]);
      const x0 = Math.min(...cells.map((c) => c[0])), x1 = Math.max(...cells.map((c) => c[0]));
      const z0 = Math.min(...cells.map((c) => c[1])), z1 = Math.max(...cells.map((c) => c[1]));
      if (zones.some((r) => x1 + 1 >= r[0] && x0 - 1 <= r[2] && z1 + 1 >= r[1] && z0 - 1 <= r[3])) continue;
      if (rough(x0, z0, x1, z1) > 2) continue;
      const F = g.height(px + ox * 3, pz + oz * 3) + 1;
      // the shelter's back is away from the road
      const back = ox > 0 ? 0 : ox < 0 ? 1 : oz > 0 ? 4 : 5;
      zones.push([x0, z0, x1, z1]);
      plan.pieces.push({ box: [x0 - 1, z0 - 1, x1 + 1, z1 + 1], build: (W) => buildBusStop(W, g, px, pz, dx, dz, ox, oz, F, back) });
      student(px + ox * 3, F, pz + oz * 3);
      campus.bus = { x: px + ox * 3, z: pz + oz * 3, F, ox, oz };
      done = true;
      break;
    }
    if (done) break;
  }
}

// ---- the pieces ----
// In front of the school: paving, trees in planters, benches, lamps, a bike rack and a sign.
function buildForecourt(W, g, fc) {
  if (!rectHits(W, fc.rect[0], fc.rect[1], fc.rect[2], fc.rect[3])) return;
  const { F } = fc;
  // never over the village square and its well
  const inSq = (a, d) => Math.max(Math.abs(fc.X(a, d) - fc.cx), Math.abs(fc.Z(a, d) - fc.cz)) <= 4;
  const S0 = lwriter(W, fc);
  const S = { set: (a, y, d, id, f) => { if (!inSq(a, d)) S0.set(a, y, d, id, f); }, pic: S0.pic };
  for (let a = -1; a <= 17; a++) for (let d = -7; d <= -2; d++) {
    const x = fc.X(a, d), z = fc.Z(a, d);
    if (!W.has(x, z) || inSq(a, d)) continue;
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y < F - 1; y++) if (y > 0) W.set(x, y, z, B.STONE_BRICKS);
    W.set(x, F - 1, z, a >= 6 && a <= 10 ? B.HYDRAULIC_TILE : B.PANOT);
    for (let y = F; y <= F + 8; y++) W.set(x, y, z, B.AIR);
  }
  // planters with cherry trees at both ends
  for (const a of [0, 16]) {
    if (inSq(a, -5)) continue;
    for (let da = -1; da <= 1; da++) for (let dd = -1; dd <= 1; dd++) if (da || dd) S.set(a + da, F, -5 + dd, B.STONE_BRICK_SLAB);
    S.set(a, F - 1, -5, B.GRASS);
    campusTree(W, fc.X(a, -5), F, fc.Z(a, -5), 'cherry', 4);
  }
  // benches looking at the entrance, lamps, a bike rack by the wall
  for (const a of [3, 4, 11, 12]) S.set(a, F, -3, shapeId('oak', 'stairs'), fc.out);
  for (const a of [2, 14]) if (!inSq(a, -7)) campusLamp(W, fc.X(a, -7), F, fc.Z(a, -7));
  for (const a of [13, 14, 15]) S.set(a, F, -2, B.IRON_BARS);
  // the campus sign on a low quartz wall at the edge, facing the square
  if (!inSq(1, -7)) {
    for (let a = 0; a <= 2; a++) { S.set(a, F, -7, B.QUARTZ_BLOCK); S.set(a, F + 1, -7, B.QUARTZ_BLOCK); }
    S.pic(0, F, -8, fc.out, 3, 2, 'campus');
  }
}

// Cafeteria downstairs; library and computer room upstairs; solar panels on the roof.
function buildAnnex(W, g, L, F) {
  const bx = L.box;
  if (!rectHits(W, bx[0] - 2, bx[1] - 2, bx[2] + 2, bx[3] + 2)) return;
  const S = lwriter(W, L);
  const Wd = 15, D = 11, F1 = F + 5, R = F + 10;
  campusGround(W, g, bx[0] - 1, bx[1] - 1, bx[2] + 1, bx[3] + 1, F, B.GRASS, R - F + 4, B.STONE_BRICKS);
  for (let a = 0; a < Wd; a++) for (let d = 0; d < D; d++) {
    const edge = a === 0 || a === Wd - 1 || d === 0 || d === D - 1;
    S.set(a, F - 1, d, edge ? B.CONCRETE + 8 : B.TERRAZZO);
    for (let y = F; y < R; y++) {
      let id = B.AIR;
      if (edge) {
        const corner = (a === 0 || a === Wd - 1) && (d === 0 || d === D - 1);
        id = B.CONCRETE;
        if (!corner) {
          const band = y === F1 || y === F + 3 || y === F + 4;
          if (d === 0 && !band && y !== F) id = B.GLASS_PANE;                    // glass front
          else if (d !== 0 && !band && (y === F + 1 || y === F + 2 || y === F1 + 1 || y === F1 + 2 || y === F1 + 3) && (a + d) % 3 !== 0) id = B.GLASS_PANE;
          if (d === 0 && y === F) id = B.CONCRETE + 7;
        }
      } else if (y === F1) id = B.PARQUET;
      S.set(a, y, d, id);
    }
    S.set(a, R, d, B.SMOOTH_STONE);
    if (edge) S.set(a, R + 1, d, B.CONCRETE);
  }
  // entrance: double doors in the glass front, a canopy and the sign above
  S.set(7, F, 0, B.DOOR, L.out); S.set(7, F + 1, 0, B.DOOR_TOP, L.out);
  S.set(6, F, 0, B.GLASS_PANE); S.set(8, F, 0, B.GLASS_PANE);
  for (let a = 5; a <= 9; a++) S.set(a, F + 2, -1, B.CONCRETE_SLAB, 8);
  for (let a = 5; a <= 9; a++) { S.set(a, F - 1, -1, B.PANOT); S.set(a, F - 1, -2, B.PANOT); }
  S.pic(4, F + 3, -1, L.out, 7, 2, 'annex');
  // ---- cafeteria ----
  for (let a = 2; a <= 8; a++) { S.set(a, F, 8, B.CRATE); S.set(a, F + 2, 10, B.CORKBOARD, L.out); }
  S.set(2, F + 1, 8, B.BARREL); S.set(5, F + 1, 8, B.LANTERN, 0); S.set(8, F + 1, 8, B.BARREL);
  S.set(10, F, 9, B.VENDING_MACHINE, L.out); S.set(11, F, 9, B.VENDING_MACHINE, L.out);
  for (const [a0, d0] of [[3, 3], [3, 6], [9, 3], [9, 6]]) {
    S.set(a0, F, d0, B.PLANK_SLAB, 8); S.set(a0 + 1, F, d0, B.PLANK_SLAB, 8);
    for (const a of [a0, a0 + 1]) { S.set(a, F, d0 - 1, shapeId('oak', 'stairs'), L.out); S.set(a, F, d0 + 1, shapeId('oak', 'stairs'), L.inw); }
  }
  for (const a of [3, 7, 11]) S.set(a, F + 4, 5, B.LANTERN, 8);
  // ---- stairs up along the right wall ----
  for (let k = 0; k < 6; k++) {
    const d = 9 - k, y = F + k;
    for (let yy = F; yy < y; yy++) S.set(13, yy, d, B.CONCRETE + 8);
    S.set(13, y, d, shapeId('terrazzo', 'stairs'), L.out);
    for (let yy = y + 1; yy <= y + 3; yy++) if (yy >= F1) S.set(13, yy, d, B.AIR);
  }
  for (let d = 5; d <= 9; d++) S.set(12, F1 + 1, d, B.GLASS_PANE);
  // ---- library (left) and computer room (right), a glass wall between them ----
  for (let d = 1; d < D - 1; d++) for (let y = F1 + 1; y < R; y++) S.set(7, y, d, d === 2 && y <= F1 + 2 ? B.AIR : B.GLASS_PANE);
  for (let a = 1; a <= 6; a++) for (let y = F1 + 1; y <= F1 + 3; y++) S.set(a, y, 9, B.BOOKSHELF);
  for (let d = 4; d <= 8; d++) for (let y = F1 + 1; y <= F1 + 2; y++) S.set(1, y, d, B.BOOKSHELF);
  for (const d0 of [4, 6]) for (const a of [3, 4]) { S.set(a, F1 + 1, d0, B.PLANK_SLAB, 8); S.set(a, F1 + 1, d0 - 1, shapeId('oak', 'stairs'), L.out); }
  S.set(5, F1 + 1, 7, B.ENCHANT_TABLE);
  S.pic(3, F1 + 2, 1, L.inw, 3, 2, 'library');
  // computers in two rows facing the whiteboard
  for (let a = 9; a <= 12; a++) for (let y = F1 + 1; y <= F1 + 2; y++) S.set(a, y, 1, B.WHITEBOARD, L.inw);
  for (const d of [4, 7]) for (const a of [9, 10, 11]) { S.set(a, F1 + 1, d, B.COMPUTER, L.inw); S.set(a, F1 + 1, d + 1, shapeId('oak', 'stairs'), L.inw); }
  S.pic(9, F1 + 3, 9, L.out, 3, 1, 'computers');
  for (const a of [3, 10]) S.set(a, R - 1, 5, B.LANTERN, 8);
  // roof: solar panels and a skylight over the stairs
  for (let a = 2; a <= 11; a += 3) for (let d = 3; d <= 7; d++) { S.set(a, R + 1, d, B.SOLAR_PANEL); S.set(a + 1, R + 1, d, B.SOLAR_PANEL); }
}

// A turf pitch with lines, goals and nets inside a fence, stands on the far side, floodlights.
function buildPitch(W, g, L, F) {
  const bx = L.box;
  if (!rectHits(W, bx[0] - 1, bx[1] - 1, bx[2] + 1, bx[3] + 1)) return;
  const S = lwriter(W, L);
  const A = 30, P = 18;            // pitch area a 0..29, d 0..17; stands d 18..21
  campusGround(W, g, bx[0], bx[1], bx[2], bx[3], F, B.GRASS, 14);
  for (let a = 1; a < A - 1; a++) for (let d = 1; d < P - 1; d++) {
    const line = a === 2 || a === A - 3 || d === 2 || d === P - 3 || a === 14 ||
      (Math.abs(Math.hypot(a - 14, d - 8.5) - 3.2) < 0.55) ||
      ((a === 6 || a === A - 7) && d >= 5 && d <= 12) || ((d === 5 || d === 12) && (a <= 6 || a >= A - 7));
    const inside = a >= 2 && a <= A - 3 && d >= 2 && d <= P - 3;
    S.set(a, F - 1, d, inside && line ? B.TURF_LINE : B.TURF);
  }
  // goals: white posts and crossbar, iron net behind
  for (const [ag, back] of [[2, 1], [A - 3, A - 2]]) {
    for (const d of [7, 10]) for (let y = F; y <= F + 2; y++) S.set(ag, y, d, B.CONCRETE);
    for (let d = 7; d <= 10; d++) S.set(ag, F + 2, d, B.CONCRETE);
    for (let d = 7; d <= 10; d++) for (let y = F; y <= F + 2; y++) S.set(back, y, d, B.IRON_BARS);
  }
  // fence with a gate in the middle of the front
  for (let a = 0; a < A; a++) for (let d = 0; d < P; d++) {
    const edge = a === 0 || a === A - 1 || d === 0 || d === P - 1;
    if (!edge || (d === 0 && a >= 14 && a <= 15)) continue;
    S.set(a, F, d, B.IRON_BARS); S.set(a, F + 1, d, B.IRON_BARS);
    S.set(a, F - 1, d, B.CONCRETE + 7);
  }
  // floodlights at the corners
  for (const [a, d] of [[0, 0], [A - 1, 0], [0, P - 1], [A - 1, P - 1]]) {
    for (let y = F; y <= F + 8; y++) S.set(a, y, d, B.BLACKSTONE_WALL);
    S.set(a, F + 9, d, B.GLASS_LAMP);
    const ia = a === 0 ? 1 : -1, id = d === 0 ? 1 : -1;
    S.set(a + ia, F + 9, d, B.GLASS_LAMP); S.set(a, F + 9, d + id, B.GLASS_LAMP);
  }
  // stands along the far side: four rows rising away from the pitch
  for (let k = 0; k < 4; k++) for (let a = 3; a <= A - 4; a++) {
    const d = P + k;
    for (let y = F - 1; y < F + k; y++) S.set(a, y, d, B.CONCRETE + 8);
    S.set(a, F + k, d, (a + k) % 2 ? B.SEAT_BLUE : B.SEAT_RED, L.inw);
  }
  // a scoreboard behind the stands
  for (let a = 11; a <= 18; a++) for (let y = F + 4; y <= F + 7; y++) S.set(a, y, P + 3, a === 11 || a === 18 || y >= F + 6 ? B.CONCRETE + 15 : B.LED_YELLOW, L.out);
  S.pic(12, F + 7, P + 2, L.out, 6, 1, 'gym');
}

// Hedged garden: paths in a cross, a fountain in the middle, trees, flowers, benches and lamps.
function buildGarden(W, g, x0, z0, F) {
  const N = 13, x1 = x0 + N - 1, z1 = z0 + N - 1, c = 6;
  if (!rectHits(W, x0 - 1, z0 - 1, x1 + 1, z1 + 1)) return;
  const flowers = [B.ROSE, B.DANDELION, B.LAVENDER, B.CORNFLOWER, B.DAISY, B.PINK_TULIP, B.ALLIUM, B.HYDRANGEA];
  campusGround(W, g, x0, z0, x1, z1, F, (x, z) => {
    const a = x - x0, b = z - z0;
    return Math.abs(a - c) <= 1 || Math.abs(b - c) <= 1 ? B.PANOT : B.GRASS;
  }, 9);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const x = x0 + a, z = z0 + b;
    const edge = a === 0 || b === 0 || a === N - 1 || b === N - 1;
    const path = Math.abs(a - c) <= 1 || Math.abs(b - c) <= 1;
    if (edge && !path) { W.set(x, F, z, B.LEAVES); continue; }
    if (!path && !edge && (a === 2 || a === N - 3 || b === 2 || b === N - 3) && hash3(x, F, z, 11) < 0.7) W.set(x, F, z, flowers[Math.floor(hash3(x, 3, z, 5) * flowers.length)]);
  }
  // fountain: a ring of stone with water and a spout
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const x = x0 + c + a, z = z0 + c + b, r = Math.max(Math.abs(a), Math.abs(b));
    if (r === 2) W.set(x, F, z, B.STONE_BRICK_SLAB);
    else { W.set(x, F - 1, z, B.WATER); W.set(x, F - 2, z, B.STONE_BRICKS); }
  }
  W.set(x0 + c, F - 1, z0 + c, B.STONE_BRICKS); W.set(x0 + c, F, z0 + c, B.CHISELED_STONE_BRICKS); W.set(x0 + c, F + 1, z0 + c, B.LANTERN, 0);
  // trees in the four beds, benches facing the fountain, lamps at the path ends
  for (const [a, b] of [[3, 3], [N - 4, 3], [3, N - 4], [N - 4, N - 4]]) campusTree(W, x0 + a, F, z0 + b, a === b ? 'cherry' : 'birch', 4);
  for (const [a, b, f] of [[c - 2, c - 3, 5], [c + 2, c - 3, 5], [c - 2, c + 3, 4], [c + 2, c + 3, 4]]) W.set(x0 + a, F, z0 + b, shapeId('oak', 'stairs'), f);
  for (const [a, b] of [[c - 2, 1], [c + 2, N - 2], [1, c + 2], [N - 2, c - 2]]) campusLamp(W, x0 + a, F, z0 + b);
}

// Bus shelter beside the road: glass back, roof, bench, a sign pole and a timetable.
function buildBusStop(W, g, px, pz, dx, dz, ox, oz, F, back) {
  const at = (u, v) => [px + dx * u + ox * v, pz + dz * u + oz * v];
  for (let u = -2; u <= 2; u++) for (let v = 3; v <= 4; v++) {
    const [x, z] = at(u, v);
    if (!W.has(x, z)) continue;
    footing(W, g, x, z, F, B.STONE_BRICKS, F + 4);
    W.set(x, F - 1, z, B.PANOT);
    if (v === 4 && Math.abs(u) <= 1) { W.set(x, F, z, B.GLASS_PANE); W.set(x, F + 1, z, B.GLASS_PANE); }
    if (Math.abs(u) === 2 && v === 4) { W.set(x, F, z, B.IRON_BARS); W.set(x, F + 1, z, B.IRON_BARS); }
    if (Math.abs(u) <= 2) W.set(x, F + 2, z, B.CONCRETE_SLAB, 8);
    if (v === 3 && Math.abs(u) <= 1) W.set(x, F, z, shapeId('oak', 'stairs'), back);
  }
  // sign pole at the kerb with the bus stop sign facing along the road
  const [sx, sz] = at(3, 3);
  if (W.has(sx, sz)) {
    footing(W, g, sx, sz, F, B.STONE_BRICKS, F + 4);
    W.set(sx, F - 1, sz, B.PANOT);
    for (let y = F; y <= F + 1; y++) W.set(sx, y, sz, B.IRON_BARS);
    W.set(sx, F + 2, sz, B.CONCRETE + 14);
    const face = dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 4 : 5;
    W.pic(sx + (face === 0 ? 1 : face === 1 ? -1 : 0), F + 2, sz + (face === 4 ? 1 : face === 5 ? -1 : 0), face, 1, 1, 'bus');
  }
  // timetable on the inside of the glass
  const [tx, tz] = at(0, 3);
  const inside = OPP[back];
  W.pic(tx, F + 1, tz, inside, 1, 1, 'timetable');
}

// Metro "Universitat": stairs down from the street under a canopy to a tiled hall with the platform
// along a track (real rails: bring a rail cart). L: frame of the 5 x 9 surface entrance.
function buildMetro(W, g, L, F) {
  const S = lwriter(W, L);
  const floor = F - 8, top = F - 3;
  // surface: paving, railings around the opening, the sign pole
  for (let a = -1; a <= 5; a++) for (let d = -1; d <= 8; d++) {
    const x = L.X(a, d), z = L.Z(a, d);
    if (!W.has(x, z)) continue;
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y < F - 1; y++) if (y > 0) W.set(x, y, z, B.STONE_BRICKS);
    W.set(x, F - 1, z, B.PANOT);
    for (let y = F; y <= F + 5; y++) W.set(x, y, z, B.AIR);
  }
  for (let d = 1; d <= 8; d++) for (const a of [0, 4]) S.set(a, F, d, B.IRON_BARS);
  for (let a = 0; a <= 4; a++) S.set(a, F, 8, B.IRON_BARS);
  // a red portal over the top of the stairs
  for (const a of [0, 4]) for (let y = F; y <= F + 2; y++) S.set(a, y, 0, B.BLACKSTONE_WALL);
  for (let a = 0; a <= 4; a++) S.set(a, F + 3, 0, B.CONCRETE + 14);
  // stairs: 7 steps down from the front, walls of white tile
  for (let k = 0; k <= 7; k++) {
    const d = k + 1, y = F - 1 - k;
    // open to the sky over the stairs; the last step already runs under the ground
    const clearTop = k <= 6 ? F + 1 : top - 1;
    for (let a = 1; a <= 3; a++) {
      for (let yy = y + 1; yy <= clearTop; yy++) S.set(a, yy, d, B.AIR);
      S.set(a, y, d, shapeId('terrazzo', 'stairs'), L.inw);
      S.set(a, y - 1, d, B.TERRAZZO);
    }
    for (const a of [0, 4]) for (let yy = y - 1; yy < F - 1; yy++) S.set(a, yy, d, yy === y + 1 ? B.BLUE_TILES : B.CONCRETE);
  }
  S.set(1, F, 0, B.AIR); S.set(2, F, 0, B.AIR); S.set(3, F, 0, B.AIR);
  // the sign: a pole with the red M and the station's name
  for (let y = F; y <= F + 2; y++) S.set(-1, y, 0, B.BLACKSTONE_WALL);
  S.set(-1, F + 3, 0, B.CONCRETE + 14);
  S.pic(-1, F + 3, -1, L.out, 1, 1, 'metro');
  S.pic(1, F + 3, -1, L.out, 3, 1, 'metro_name');
  // the hall: a = -4..8, d = 9..26, floor at `floor`, ceiling at `top`
  for (let a = -4; a <= 8; a++) for (let d = 8; d <= 26; d++) {
    const edge = a === -4 || a === 8 || d === 26 || (d === 8 && (a < 1 || a > 3));
    for (let y = floor - 2; y <= top + 1; y++) {
      let id = B.AIR;
      if (y === top + 1) id = B.CONCRETE;
      else if (y === top) id = (a + d) % 4 === 0 && !edge ? B.GLASS_LAMP : B.CONCRETE + 8;
      else if (edge) id = y === floor + 1 ? B.BLUE_TILES : y < floor ? B.CONCRETE + 7 : B.CONCRETE;
      else if (y === floor - 1) id = a >= 5 ? B.AIR : B.TERRAZZO;     // the track bed is one lower
      else if (y === floor - 2 && a >= 5) id = B.GRAVEL;
      else if (y < floor - 1) id = B.CONCRETE + 7;
      S.set(a, y, d, id);
    }
    if (d === 8 && a >= 1 && a <= 3) for (let y = floor; y < top; y++) S.set(a, y, d, B.AIR);
  }
  // platform edge, the track and tunnel mouths at both ends
  const rail = L.out === 4 || L.out === 5 ? B.RAIL : B.RAIL_EW;
  for (let d = 9; d <= 25; d++) { S.set(4, floor - 1, d, B.CONCRETE + 4); S.set(6, floor - 1, d, rail); }
  // the tunnel mouths at both ends, dark after a couple of blocks
  for (const d of [8, 26]) for (let a = 5; a <= 7; a++) for (let y = floor - 2; y <= floor + 2; y++) S.set(a, y, d, y === floor - 2 ? B.GRAVEL : y === floor - 1 && a === 6 ? rail : B.AIR);
  for (const d of [7, 27]) for (let a = 5; a <= 7; a++) for (let y = floor - 2; y <= floor + 3; y++) S.set(a, y, d, B.CONCRETE + 15);
  // tiled columns along the platform and posters between them
  for (const d of [11, 16, 21]) for (let y = floor; y < top; y++) S.set(2, y, d, y === floor + 1 ? B.BLUE_TILES : B.QUARTZ_PILLAR);
  S.pic(7, floor + 1, 22, L.back, 2, 1, 'sunset', true);
  S.pic(7, floor + 1, 15, L.back, 2, 1, 'mountains', true);
  // benches, signs with the name, a map and a ticket machine on the platform
  for (const d of [12, 13, 20, 21]) S.set(-3, floor, d, shapeId('oak', 'stairs'), L.back);
  for (const d of [11, 18, 23]) S.pic(-3, floor + 1, d, L.along, 1, 1, 'metro');
  S.pic(7, floor + 2, 12, L.back, 3, 1, 'metro_name', true);
  S.pic(7, floor + 2, 19, L.back, 3, 1, 'metro_name', true);
  S.pic(-3, floor + 1, 14, L.along, 2, 1, 'metro_map', true);
  S.set(-3, floor, 16, B.VENDING_MACHINE, L.along);
}
