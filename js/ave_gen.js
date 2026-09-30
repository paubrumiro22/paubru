'use strict';
// The high-speed line (AVE): from a station just outside the district's west edge a viaduct runs
// straight west for 900 blocks and into a tunnel under a hill. The station: a glass hall at
// ground level under the tracks (ticket machines, departure boards, benches), stairs and a lift up
// through the deck to an island platform between two tracks, a steel and glass canopy, a plaza
// and a lit path back towards the district. Catenary masts every 24 blocks, pillars every 16,
// tunnels where the ground rises over the deck. Deterministic: loaded in the chunk workers too
// (data-w); structures.js calls aveChunk for every chunk. ave.js runs the trains.
//
// Coordinates: w is the offset across the line (z - L.z); the tracks are at w = ±5, the island
// platform w = -3..3, the deck w = -7..7 at y = L.y, the ground under the station at L.F.

const AVE_LEN = 900;

function aveLine(g) {
  if (!g || !g.structs || typeof stucomVillage !== 'function') return null;
  if (g._ave !== undefined) return g._ave;
  const st = stucomVillage(g);
  if (!st || !st.district) { g._ave = null; return null; }
  const D = st.district, xe = D.cx - DOUT - 8;
  g._ave = { z: D.cz, y: D.F + 9, F: D.F, xe, xs: xe - 64, xw: xe - AVE_LEN, cx: D.cx, cz: D.cz, pathEnd: D.cx - DHALF - 14 };
  const L = g._ave;
  L.sx = L.xs + 22;          // foot of the stairs up to the platform
  L.lift = L.sx - 4;         // the lift shaft (on the island, w = 0)
  L.stop = L.xe - 33;        // where a train's middle stops at the platform
  return L;
}

// a builder for this chunk, or null
function aveChunk(g, x0, z0) {
  const L = aveLine(g);
  if (!L) return null;
  if (x0 + CS - 1 < L.xw - 30 || x0 > L.pathEnd + 2 || z0 + CS - 1 < L.z - 18 || z0 > L.z + 20) return null;
  return (W) => buildAve(W, g, L);
}

const AVE_LOGS = new Set([B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PALM_LOG, B.ACACIA_LOG, B.CHERRY_LOG, B.DARK_OAK_LOG]);

function buildAve(W, g, L) {
  const { z: lz, y: Y, F, xs, xe, xw } = L;
  const C = B.CONCRETE + 8, DARK = B.CONCRETE + 7;
  const inSt = (x) => x >= xs && x <= xe + 1;
  const rect = (xa, xb, wa, wb, fn) => cityRect(W, xa, lz + wa, xb, lz + wb, (x, z) => fn(x, z - lz, z));
  const top = (x, z) => {
    for (let y = Math.min(CH - 2, Y + 24); y > 1; y--) {
      const id = W.get(x, y, z);
      if (id <= 0 || !BLOCK_SOLID[id] || BLOCK_RT[id] === RT_CROSS || BLOCK_RT[id] === RT_CUTOUT || IS_LIQUID(id) || AVE_LOGS.has(id)) continue;
      return y;
    }
    return g.height(x, z);
  };

  // ---- the station pad: levelled ground, clear up to the sky ----
  rect(xs - 4, xe + 4, -16, 18, (x, w, z) => {
    const h = g.height(x, z);
    for (let y = Math.min(h, F - 2); y <= F - 2; y++) W.set(x, y, z, y >= F - 3 ? B.DIRT : B.STONE);
    W.set(x, F - 1, z, Math.abs(w) <= 8 && x > xs + 1 && x < xe - 1 ? B.TERRAZZO : (w + x) % 7 === 0 ? B.POLISHED_ANDESITE : B.PANOT);
    for (let y = F; y <= Math.max(h + 8, Y + 12) && y < CH; y++) if (W.get(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
  });

  // ---- the hill over the tunnel mouth ----
  rect(xw - 30, xw + 8, -18, 18, (x, w, z) => {
    const h = g.height(x, z);
    const t = Math.round(Y + 12 - Math.max(0, Math.abs(w) - 9) * 1.3 - Math.max(0, x - (xw - 4)) * 1.4);
    for (let y = h + 1; y <= t; y++) W.set(x, y, z, y === t ? B.GRASS : y > t - 3 ? B.DIRT : B.STONE);
  });

  // ---- the viaduct ----
  rect(xw - 26, xe + 1, -9, 9, (x, w, z) => {
    const h = g.height(x, z), aw = Math.abs(w), st = inSt(x), mouth = x < xw;
    const tunnel = mouth || (!st && h >= Y + 3);
    if (aw === 9) { if (tunnel && !mouth) for (let y = Y; y <= Y + 9; y++) W.set(x, y, z, DARK); return; }
    if (aw === 8) {
      if (tunnel) { for (let y = Y; y <= Y + 9; y++) W.set(x, y, z, mouth ? B.CONCRETE + 15 : C); }
      return;
    }
    // deck, rails, parapets, the island
    W.set(x, Y, z, x > xe ? C : aw === 5 ? B.GRAVEL : C);
    for (let y = Y + 1; y <= Y + 8; y++) W.set(x, y, z, B.AIR);
    if (aw === 5) W.set(x, Y + 1, z, x >= xe ? B.CONCRETE + 14 : B.RAIL_EW);
    if (aw === 5 && x >= xe) W.set(x, Y + 2, z, B.CONCRETE + 14);
    if (aw === 7) { W.set(x, Y + 1, z, C); if (!st && !tunnel) W.set(x, Y + 2, z, B.GLASS_PANE); }
    if (x === xe + 1) for (let y = Y + 1; y <= Y + 2; y++) W.set(x, y, z, C);
    if (st && aw <= 3 && x <= xe) W.set(x, Y + 1, z, aw === 3 ? B.CONCRETE + 4 : B.TERRAZZO);
    if (tunnel) {
      W.set(x, Y + 9, z, (x % 8 === 0 && w === 0) ? B.GLASS_LAMP : mouth ? B.CONCRETE + 15 : C);
      if (x === xw - 26) for (let y = Y + 1; y <= Y + 8; y++) W.set(x, y, z, B.CONCRETE + 15);
    }
    // pillars (the hall holds the deck in the station)
    if (!st && !tunnel && x % 16 === 0 && aw <= 2) for (let y = Math.max(1, h - 3); y < Y; y++) W.set(x, y, z, aw === 2 ? DARK : C);
    // catenary masts
    if (!tunnel && x % 24 === 0) {
      if (aw === 7) for (let y = Y + 2; y <= Y + 7; y++) W.set(x, y, z, B.IRON_BARS);
      W.set(x, Y + 8, z, B.IRON_BARS);
    }
  });
  // the tunnel portal
  rect(xw - 1, xw - 1, -12, 12, (x, w, z) => {
    for (let y = Y; y <= Y + 12; y++) if (Math.abs(w) > 7 || y > Y + 8) W.set(x, y, z, y === Y + 12 || Math.abs(w) === 12 ? DARK : C);
  });

  // ---- the hall under the tracks ----
  const hx0 = xs + 2, hx1 = xe - 2, mid = (hx0 + hx1) >> 1;
  rect(hx0, hx1, -8, 8, (x, w, z) => {
    const aw = Math.abs(w), edge = aw === 8 || x === hx0 || x === hx1;
    for (let y = F; y < Y; y++) {
      let id = B.AIR;
      if (edge) {
        const post = aw === 8 ? (x - hx0) % 6 === 0 || x === hx1 : aw % 4 === 0;
        id = post ? DARK : y === F + 4 ? B.STEEL_PLATE : B.GLASS;
      } else if (y === Y - 1 && (x - hx0) % 6 === 3 && (w === -4 || w === 4)) id = B.GLASS_LAMP;
      W.set(x, y, z, id);
    }
  });
  // doors: the south side, and both ends
  placeADoors(W, [[mid - 1, lz + 8], [mid, lz + 8], [mid + 1, lz + 8]].filter(([x, z]) => W.has(x, z)), F, 4);
  placeADoors(W, [[hx1, lz - 1], [hx1, lz], [hx1, lz + 1]].filter(([x, z]) => W.has(x, z)), F, 0);
  // inside: ticket machines, benches, plants
  rect(hx0 + 1, hx1 - 1, -7, 7, (x, w, z) => {
    const r = x - hx0;
    if (w === -7 && [6, 8, 34, 36, 50, 52].includes(r)) W.set(x, F, z, B.VENDING_MACHINE, 4);
    if (w === 5 && ((r >= 8 && r <= 11) || (r >= 42 && r <= 45))) W.set(x, F, z, B.SOFA_GRAY, 5);
    if ((w === -7 || w === 7) && (r === 1 || r === hx1 - hx0 - 1)) { W.set(x, F, z, B.PODZOL); W.set(x, F + 1, z, B.BUSH); }
  });
  for (const r of [12, 42]) if (W.has(hx0 + r, lz - 7)) W.pic(hx0 + r, F + 3, lz - 7, 4, 4, 2, 'ave_board');
  if (W.has(mid - 4, lz + 9)) W.pic(mid - 4, Y - 3, lz + 9, 4, 8, 2, 'ave_sign');

  // ---- stairs up through the deck to the island ----
  const sx = L.sx;
  rect(sx - 1, sx + 11, -2, 2, (x, w, z) => {
    const k = x - sx, aw = Math.abs(w);
    if (aw <= 1 && k >= 0 && k <= 10) {
      for (let y = F; y < F + k; y++) W.set(x, y, z, B.TERRAZZO);
      W.set(x, F + k, z, shapeId('terrazzo', 'stairs'), 0);
      for (let y = F + k + 1; y <= F + k + 3; y++) if (y !== Y + 1 || k < 10) W.set(x, y, z, B.AIR);
      if (k < 6) for (let y = F + k + 4; y < Y; y++) if (W.get(x, y, z) === B.AIR) W.set(x, y, z, B.AIR);
    }
    // railings round the opening in the island
    if (aw === 2 && k >= 6 && k <= 10) W.set(x, Y + 2, z, B.GLASS_PANE);
    if (aw <= 1 && k === 6) W.set(x, Y + 2, z, B.GLASS_PANE);
  });
  // ---- the lift: a plate in the hall and one on the island, a glass shaft ----
  rect(L.lift - 1, L.lift + 1, -1, 1, (x, w, z) => {
    const shaft = x === L.lift && w === 0;
    for (let y = F - 1; y <= Y + 4; y++) {
      let id;
      if (shaft) id = y === F - 1 || y === Y + 1 ? B.LIFT_FLOOR : B.AIR;
      else if (y === Y + 4) id = B.GLASS;
      else if (y < F || y === Y + 1) continue;
      else if ((x === L.lift + 1 && w === 0 && (y <= F + 1 || (y >= Y + 2 && y <= Y + 3)))) id = B.AIR;
      else id = B.GLASS;
      W.set(x, y, z, id);
    }
  });
  // ---- the canopy over the platform ----
  rect(xs, xe, -8, 8, (x, w, z) => {
    const r = x - xs, aw = Math.abs(w);
    if (w === 0 && r % 12 === 6 && Math.abs(x - L.lift) > 1 && (x < sx + 5 || x > sx + 11)) for (let y = Y + 2; y <= Y + 7; y++) W.set(x, y, z, B.STEEL_PLATE);
    W.set(x, Y + 8, z, r % 6 === 0 || aw === 8 ? B.STEEL_PLATE : aw <= 1 ? B.GLASS_LAMP : B.GLASS);
  });

  // ---- the plaza and a lit path back towards the district ----
  rect(xs, xe, 15, 15, (x, w, z) => { if ((x - xs) % 12 === 4) campusLamp(W, x, F, z); });
  rect(xe + 5, L.pathEnd, 10, 14, (x, w, z) => {
    const y = top(x, z);
    W.set(x, y, z, w === 10 || w === 14 ? B.POLISHED_ANDESITE : B.PANOT);
    for (let yy = y + 1; yy <= y + 5; yy++) { const id = W.get(x, yy, z); if (id > 0 && id !== B.AIR) W.set(x, yy, z, B.AIR); }
    if (w === 14 && (x - xe) % 16 === 0) campusLamp(W, x, y + 1, z);
  });
}
