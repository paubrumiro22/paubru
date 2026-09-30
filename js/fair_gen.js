'use strict';
// The funfair north of the district (data-w: the workers build its blocks). Everything that moves
// (the Ferris wheel, the roller coaster trains and its track, the carousel, the drop tower's ring,
// the balloons) is drawn by fair.js; here go the ground, paths, fences, the entrance arch, the
// stalls, the wheel's A-frame, the drop tower's mast, the coaster station and its supports.
// fairTrack() is shared by both: the supports stand exactly under the track the trains ride.
// Local frame: a = x - S.x (east), b = z - S.z (south, towards the district), y above S.F.

const FAIR_A = 62, FAIR_B0 = -60, FAIR_B1 = 58;       // the fenced rectangle
const FAIR_WHEEL = { a: -32, b: -30, y: 19.5, R: 16, n: 16 };
const FAIR_CAROUSEL = { a: -30, b: 24, R: 7 };
const FAIR_TOWER = { a: 36, b: 26, h: 42 };
const FAIR_BALLOONS = { a: -6, b: -44 };
const FAIR_PLAZA = { a: 0, b: 16, R: 8 };
const FAIR_STATION = { a0: 10, a1: 28, b: -8, y: 3 };

function fairSite(g) {
  if (!g || !g.structs || typeof stucomVillage !== 'function') return null;
  if (g._fair !== undefined) return g._fair;
  const st = stucomVillage(g);
  if (!st || !st.district) { g._fair = null; return null; }
  const D = st.district;
  g._fair = { x: D.cx, z: D.cz - DOUT - 66, F: D.F, pathEnd: D.cz - DHALF - 14 };
  return g._fair;
}

// The coaster circuit as points every half block ({x, y, z, k}: k 1 station, 2 chain lift, 3 loop,
// 4 run back in), local to the fair, closed (the last point is the first one).
function fairTrack() {
  if (fairTrack.pts) return fairTrack.pts;
  const P = [];
  let x = FAIR_STATION.a0, z = FAIR_STATION.b, y = FAIR_STATION.y, h = 0;   // heading 0 = +x, +h turns towards +z
  const push = (k) => P.push({ x, y, z, k });
  const ease = (t, e) => e === 'lin' ? t : t * t * (3 - 2 * t);
  const straight = (L, dy = 0, e = 's', k = 0) => {
    const y0 = y, x0 = x, z0 = z;
    for (let s = 0.5; s <= L + 1e-6; s += 0.5) { x = x0 + Math.cos(h) * s; z = z0 + Math.sin(h) * s; y = y0 + dy * ease(s / L, e); push(k); }
  };
  const turn = (a, R, dy = 0) => {
    const y0 = y, h0 = h, sg = Math.sign(a), cx = x - Math.sin(h) * R * sg, cz = z + Math.cos(h) * R * sg, L = Math.abs(a) * R;
    for (let s = 0.5; s <= L + 1e-6; s += 0.5) { h = h0 + a * s / L; x = cx + Math.sin(h) * R * sg; z = cz - Math.cos(h) * R * sg; y = y0 + dy * ease(s / L, 's'); push(0); }
    h = h0 + a;
  };
  const loop = (R, side) => {
    const x0 = x, z0 = z, y0 = y, fx = Math.cos(h), fz = Math.sin(h), lx = -fz * side, lz = fx * side, L = 2 * Math.PI * R;
    for (let s = 0.5; s <= L + 1e-6; s += 0.5) {
      const th = s / L * 2 * Math.PI, sh = 3 * ease(s / L, 's');
      x = x0 + fx * R * Math.sin(th) + lx * sh; z = z0 + fz * R * Math.sin(th) + lz * sh; y = y0 + R * (1 - Math.cos(th)); push(3);
    }
  };
  const bez = (X, Z, Y, H) => {
    const x0 = x, z0 = z, y0 = y, d = Math.hypot(X - x0, Z - z0) * 0.45;
    const c1 = [x0 + Math.cos(h) * d, z0 + Math.sin(h) * d], c2 = [X - Math.cos(H) * d, Z - Math.sin(H) * d];
    const pt = (t) => { const u = 1 - t; return [u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * X, u * u * u * z0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * Z]; };
    let len = 0, prev = [x0, z0];
    for (let i = 1; i <= 200; i++) { const q = pt(i / 200); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
    const n = Math.ceil(len / 0.5);
    for (let i = 1; i <= n; i++) { const q = pt(i / n); x = q[0]; z = q[1]; y = y0 + (Y - y0) * ease(i / n, 's'); push(4); }
    h = H;
  };
  push(1);
  straight(18, 0, 's', 1);          // the station
  straight(4, 1.5);
  straight(21, 21, 'lin', 2);       // the chain lift
  straight(3, 1);                   // the crest
  turn(-Math.PI / 2, 5);            // round to the north
  straight(28, -23.5);              // the big drop
  straight(3);
  loop(8, -1);                      // the loop
  straight(6);
  turn(-Math.PI / 2, 8, 6);         // banked turn to the west
  straight(11, 5); straight(11, -10); straight(9, 7); straight(8, -4);   // airtime hills
  turn(-Math.PI * 1.5, 7, -4);      // descending helix
  bez(FAIR_STATION.a0 - 0.5, FAIR_STATION.b, FAIR_STATION.y, 0);         // back into the station
  P[P.length - 1] = Object.assign({}, P[0], { k: 4 });
  fairTrack.pts = P;
  return P;
}

function fairChunk(g, x0, z0) {
  const S = fairSite(g);
  if (!S) return null;
  if (x0 + CS - 1 < S.x - FAIR_A - 4 || x0 > S.x + FAIR_A + 4 || z0 + CS - 1 < S.z + FAIR_B0 - 4 || z0 > Math.max(S.z + FAIR_B1 + 4, S.pathEnd)) return null;
  return (W) => buildFair(W, g, S);
}

function buildFair(W, g, S) {
  const { x: X, z: Z, F } = S;
  const at = (a, b) => [X + a, Z + b];
  const put = (a, y, b, id, f) => { const x = X + a, z = Z + b; if (W.has(x, z)) W.set(x, F + y, z, id, f); };
  const rect = (a0, b0, a1, b1, fn) => cityRect(W, X + a0, Z + b0, X + a1, Z + b1, (x, z) => fn(x - X, z - Z, x, z));
  const inPath = (a, b) => Math.abs(a) <= 3 || (Math.abs(b - FAIR_PLAZA.b) <= 2 && Math.abs(a) <= 44) || (Math.abs(a + 30) <= 2 && b >= -12 && b <= 16) || (Math.abs(b + 4) <= 2 && a >= -30 && a <= 34) || (Math.abs(a - 34) <= 2 && b >= -4 && b <= 16);

  // the ground: levelled, cleared, grass with paths
  rect(-FAIR_A - 3, FAIR_B0 - 3, FAIR_A + 3, FAIR_B1 + 3, (a, b, x, z) => {
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y <= F - 2; y++) W.set(x, y, z, y >= F - 3 ? B.DIRT : B.STONE);
    const inside = Math.abs(a) <= FAIR_A && b >= FAIR_B0 && b <= FAIR_B1;
    const pl = Math.hypot(a - FAIR_PLAZA.a, b - FAIR_PLAZA.b);
    let top = B.GRASS;
    if (inside && pl <= FAIR_PLAZA.R + 3) top = pl <= FAIR_PLAZA.R + 2 && ((Math.floor(pl) + Math.floor(Math.atan2(b - FAIR_PLAZA.b, a) * 4)) & 1) ? B.HYDRAULIC_TILE : B.TERRAZZO;
    else if (inside && inPath(a, b)) top = (Math.abs(a) === 3 || Math.abs(a) === 2 && Math.abs(b) > 40) ? B.POLISHED_ANDESITE : B.PANOT;
    W.set(x, F - 1, z, top);
    for (let y = F; y <= Math.max(h + 6, F + 12) && y < CH; y++) if (W.get(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
  });
  // the fence all round with lamps, the entrance gap in the south
  rect(-FAIR_A, FAIR_B0, FAIR_A, FAIR_B1, (a, b, x, z) => {
    const edge = Math.abs(a) === FAIR_A || b === FAIR_B0 || b === FAIR_B1;
    if (!edge || (b === FAIR_B1 && Math.abs(a) <= 5)) return;
    W.set(x, F, z, (a + b) % 10 === 0 ? B.BLACKSTONE_WALL : B.DARK_OAK_FENCE);
    if ((a + b) % 20 === 0) campusLamp(W, x, F, z);
  });
  // the entrance: two striped towers, an arch with the sign, ticket booths
  for (const s of [-1, 1]) {
    rect(s * 7 - 1, FAIR_B1 - 1, s * 7 + 1, FAIR_B1 + 1, (a, b, x, z) => {
      for (let y = 0; y <= 10; y++) W.set(x, F + y, z, y === 10 ? B.WOOL + 14 : (y >> 1) % 2 ? B.WOOL + 0 : B.WOOL + 14);
      W.set(x, F + 11, z, B.SEA_LANTERN);
    });
    put(s * 7, 12, FAIR_B1, B.LED_YELLOW);
    // ticket booths either side: a kiosk with a striped roof and a machine
    rect(s * 12 - 2, FAIR_B1 - 3, s * 12 + 2, FAIR_B1 - 1, (a, b, x, z) => {
      const edge = Math.abs(a - s * 12) === 2 || b === FAIR_B1 - 3;
      for (let y = 0; y <= 2; y++) W.set(x, F + y, z, edge ? (y === 1 && b === FAIR_B1 - 1 ? B.GLASS : B.WOOL + 0) : B.AIR);
      W.set(x, F + 3, z, (a + 20) % 2 ? B.WOOL + 14 : B.WOOL + 0);
    });
    put(s * 12, 0, FAIR_B1, B.TICKET_MACHINE, 4);
  }
  rect(-7, FAIR_B1, 7, FAIR_B1, (a, b, x, z) => { for (let y = 8; y <= 9; y++) W.set(x, F + y, z, y === 9 && a % 2 === 0 ? B.LED_YELLOW : B.WOOL + 11); });
  if (W.has(X - 5, Z + FAIR_B1 + 1)) W.pic(X - 5, F + 5, Z + FAIR_B1 + 1, 4, 10, 3, 'fair_sign');
  // the path from the district to the gate
  cityRect(W, X - 7, Z + FAIR_B1 + 2, X + 7, S.pathEnd, (x, z) => {
    if (Math.abs(x - X) > 3) { for (let y = F; y <= F + 14 && y < CH; y++) { const id = W.get(x, y, z); if (id > 0 && (BLOCK_RT[id] === RT_CROSS || id === B.LEAVES || id === B.LOG || id === B.BIRCH_LEAVES || id === B.BIRCH_LOG || id === B.SPRUCE_LEAVES || id === B.SPRUCE_LOG || id === B.CHERRY_LEAVES || id === B.CHERRY_LOG)) W.set(x, y, z, B.AIR); } return; }
    let y = F + 20;
    while (y > 2 && (W.get(x, y, z) <= 0 || !BLOCK_SOLID[W.get(x, y, z)] || BLOCK_RT[W.get(x, y, z)] === RT_CROSS || BLOCK_RT[W.get(x, y, z)] === RT_CUTOUT)) y--;
    W.set(x, y, z, Math.abs(x - X) === 3 ? B.POLISHED_ANDESITE : B.PANOT);
    for (let yy = y + 1; yy <= y + 5; yy++) if (W.get(x, yy, z) > 0) W.set(x, yy, z, B.AIR);
    if (Math.abs(x - X) === 3 && (z - Z) % 12 === 0) campusLamp(W, x + Math.sign(x - X), y + 1, z);
  });

  // the plaza: a round fountain and benches
  rect(FAIR_PLAZA.a - 4, FAIR_PLAZA.b - 4, FAIR_PLAZA.a + 4, FAIR_PLAZA.b + 4, (a, b, x, z) => {
    const d = Math.hypot(a - FAIR_PLAZA.a, b - FAIR_PLAZA.b);
    if (d <= 3.6 && d > 2.6) W.set(x, F, z, B.QUARTZ_BLOCK);
    else if (d <= 2.6) { W.set(x, F - 1, z, B.WATER); if (d < 0.8) { W.set(x, F - 1, z, B.QUARTZ_PILLAR); W.set(x, F, z, B.QUARTZ_PILLAR); W.set(x, F + 1, z, B.SEA_LANTERN); } }
  });
  for (const [a, b, f] of [[-6, FAIR_PLAZA.b - 6, 4], [6, FAIR_PLAZA.b - 6, 4], [-6, FAIR_PLAZA.b + 6, 5], [6, FAIR_PLAZA.b + 6, 5]]) put(a, 0, b, shapeId('oak', 'stairs'), f);

  // food and game stalls along the avenue: counter, striped awning, lights
  const STALLS = [[-8, 44, 1], [8, 44, 1], [-8, 34, 14], [8, 34, 4], [-8, 50, 5], [8, 50, 10]];
  for (const [a0, b0, col] of STALLS) {
    const s = Math.sign(a0);
    rect(a0 - (s > 0 ? 0 : 3), b0 - 2, a0 + (s > 0 ? 3 : 0), b0 + 2, (a, b, x, z) => {
      const front = a === a0, back = a === a0 + s * 3, side = Math.abs(b - b0) === 2;
      W.set(x, F - 1, z, B.PLANKS);
      if (front) W.set(x, F, z, B.DARK_OAK_PLANKS);
      else if (back || side) for (let y = 0; y <= 2; y++) W.set(x, F + y, z, B.DARK_OAK_PLANKS);
      W.set(x, F + 3, z, (b - b0 + 2) % 2 ? B.WOOL + 0 : B.WOOL + col);
      if (front && (b - b0) % 2 === 0) W.set(x, F + 3, z, B.LED_YELLOW);
    });
    put(a0 + s, 0, b0, B.VENDING_MACHINE, s > 0 ? 1 : 0);
  }
  // trees, flower beds and lamps between the attractions
  const trees = [[-16, 40], [16, 40], [-18, 6], [18, 8], [-48, 6], [-48, 44], [50, 48], [52, 4], [-12, -16], [-50, -52], [-4, 30], [4, 30], [22, 44], [-22, 44]];
  for (const [a, b] of trees) { const [x, z] = at(a, b); if (Math.abs(a) < FAIR_A - 2) campusTree(W, x, F, z, (a + b) & 1 ? 'cherry' : 'oak', 5); }
  rect(-FAIR_A + 1, FAIR_B0 + 1, FAIR_A - 1, FAIR_B1 - 1, (a, b, x, z) => {
    if (W.get(x, F - 1, z) !== B.GRASS || W.get(x, F, z) !== B.AIR) return;
    const r = hash3(x, 7, z, 1234);
    if (r < 0.05) W.set(x, F, z, [B.ROSE, B.DANDELION, B.TULIP, B.CORNFLOWER, B.ALLIUM][Math.floor(r * 100) % 5]);
    else if (r < 0.14) W.set(x, F, z, B.TALLGRASS);
    if (inPath(a + 4, b) !== inPath(a, b) && (a + b) % 14 === 0 && Math.abs(a) > 4) campusLamp(W, x, F, z);
  });
  for (let b = FAIR_B1 - 6; b > FAIR_PLAZA.b + 10; b -= 8) for (const s of [-1, 1]) { const [x, z] = at(s * 4, b); campusLamp(W, x, F, z); }

  // ---- the Ferris wheel: an A-frame each side of the wheel, a boarding deck ----
  const Wh = FAIR_WHEEL;
  for (const db of [-3, 3]) for (const da of [-11, 11]) {
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = Math.round(Wh.a + da * (1 - t)), y = Math.round(Wh.y * t), b = Wh.b + db;
      put(a, y, b, B.CONCRETE + 0);
    }
  }
  for (const db of [-3, 3]) put(Wh.a, Math.round(Wh.y), Wh.b + db, B.STEEL_PLATE);
  for (let da = -11; da <= 11; da++) for (const db of [-3, 3]) put(Wh.a + da, 0, Wh.b + db, B.CONCRETE + 7);
  rect(Wh.a - 3, Wh.b - 2, Wh.a + 3, Wh.b + 5, (a, b, x, z) => { W.set(x, F - 1, z, B.CONCRETE + 7); if (b === Wh.b + 5 && Math.abs(a - Wh.a) === 3) campusLamp(W, x, F, z); });
  put(Wh.a + 3, 0, Wh.b + 4, B.TICKET_MACHINE, 4);
  // ---- the carousel: a round base, a low wall with a gap ----
  const C = FAIR_CAROUSEL;
  rect(C.a - C.R - 2, C.b - C.R - 2, C.a + C.R + 2, C.b + C.R + 2, (a, b, x, z) => {
    const d = Math.hypot(a - C.a, b - C.b);
    if (d <= C.R + 0.5) W.set(x, F - 1, z, B.CONCRETE + 7);
    else if (d <= C.R + 1.6) { W.set(x, F - 1, z, B.TERRAZZO); if (d > C.R + 1 && !(b > C.b && Math.abs(a - C.a) <= 1)) W.set(x, F, z, B.OAK_FENCE); }
  });
  put(C.a + 2, 0, C.b + C.R + 2, B.TICKET_MACHINE, 4);
  // ---- the drop tower: a 3×3 steel mast with lights, a pit round its foot ----
  const T = FAIR_TOWER;
  rect(T.a - 1, T.b - 1, T.a + 1, T.b + 1, (a, b, x, z) => {
    for (let y = 0; y <= T.h; y++) W.set(x, F + y, z, a === T.a && b === T.b ? B.STEEL_PLATE : y % 6 === 5 ? B.LED_RED : (y + a + b) % 3 === 0 ? B.STEEL_PLATE : B.IRON_BARS);
    W.set(x, F + T.h + 1, z, B.STEEL_PLATE);
  });
  put(T.a, T.h + 2, T.b, B.LED_RED);
  rect(T.a - 5, T.b - 5, T.a + 5, T.b + 5, (a, b, x, z) => { const d = Math.max(Math.abs(a - T.a), Math.abs(b - T.b)); if (d >= 2) W.set(x, F - 1, z, d === 5 ? B.CONCRETE + 4 : B.CONCRETE + 15); if (d === 5 && !(b > T.b && Math.abs(a - T.a) <= 1)) W.set(x, F, z, B.IRON_BARS); });
  put(T.a + 2, 0, T.b + 6, B.TICKET_MACHINE, 4);
  // ---- the balloon field: a round pad with baskets' marks ----
  const Bl = FAIR_BALLOONS;
  rect(Bl.a - 9, Bl.b - 9, Bl.a + 9, Bl.b + 9, (a, b, x, z) => { const d = Math.hypot(a - Bl.a, b - Bl.b); if (d <= 8.5) W.set(x, F - 1, z, d > 7.5 ? B.CONCRETE + 1 : B.GRASS); });
  put(Bl.a, 0, Bl.b + 10, B.TICKET_MACHINE, 4);

  // ---- the coaster: station, queue, supports under the track ----
  const Sa = FAIR_STATION;
  rect(Sa.a0 - 1, Sa.b + 2, Sa.a1 + 1, Sa.b + 4, (a, b, x, z) => {
    for (let y = 0; y <= 1; y++) W.set(x, F + y, z, B.TERRAZZO);
    if (b === Sa.b + 2 && (a - Sa.a0) % 3 === 0) { W.set(x, F + 2, z, B.IRON_BARS); }
  });
  rect(Sa.a0 - 1, Sa.b - 3, Sa.a1 + 1, Sa.b + 4, (a, b, x, z) => {
    // a roof on slim posts over the train and the platform
    W.set(x, F + 7, z, (a + b) % 2 ? B.WOOL + 14 : B.WOOL + 0);
    if ((b === Sa.b - 3 || b === Sa.b + 4) && (a - Sa.a0) % 6 === 0) for (let y = b === Sa.b + 4 ? 2 : 0; y < 7; y++) W.set(x, F + y, z, B.BLACKSTONE_WALL);
  });
  for (let a = Sa.a0 + 2; a <= Sa.a1 - 2; a += 4) put(a, 2, Sa.b + 3, B.LED_YELLOW);
  put(Sa.a1 + 2, 0, Sa.b + 5, B.TICKET_MACHINE, 4);
  for (let a = Sa.a1 + 1; a <= Sa.a1 + 3; a++) put(a, 0, Sa.b + 4, shapeId('stone_brick', 'stairs') || B.TERRAZZO_SLAB, 1);
  const P = fairTrack();
  for (let i = 0; i < P.length; i += 8) {
    const q = P[i];
    if (q.k === 1 || (q.k === 3 && Math.abs(q.y - FAIR_STATION.y) > 0.5)) continue;
    const a = Math.round(q.x), b = Math.round(q.z), top = Math.floor(q.y - 1.2);
    if (top < 0) continue;
    for (let y = 0; y <= top; y++) put(a, y, b, B.BLACKSTONE_WALL);
    put(a, -1, b, B.CONCRETE + 7);
  }
}
