'use strict';
// A showcase world: FC Barcelona's rebuilt stadium (Nikken Sekkei + Pascual i Ausio) at real scale
// (1 block = 1 m, about 270 x 240 m). The pitch sits 12 m below the street. Inside: 105 x 68 pitch
// with mowing stripes, markings, goals and nets, LED boards, glazed dugouts and tunnel to the
// dressing room; three tiers of real seats (garnet-red with blue scattered, bluer at the front of
// the lower tier and the back of the upper one), each tier cantilevered over the one below; the
// crest and Spotify's roundel drawn in seats in the middle tier; the double VIP ring with its
// presidential box; two 360-degree LED rings with the motto; three video boards. Outside:
// concourses carved into the back of the stands, open timber-decked terraces under aluminium slat
// soffits that step further out the higher they are, glass balustrades, lit blaugrana fins, 92
// columns, glass lift cores and grand stairs to the plaza. On top, the tensile roof (navy outside,
// white and translucent inside, open over the pitch) with radial cables, the lit tension ring,
// the skywalk and a rim that glows blue and garnet at night. Everything is computed per column
// from the stadium's shape, so chunks build it independently (in workers too).

const CN = {
  ver: 2,                   // bump to drop old Camp Nou saves when the stadium changes shape
  G: 40,                    // grass level (players stand at G + 1)
  S: 52,                    // street level: the pitch sits 12 m below it, like the real one
  hx: 35, hz: 16, rc: 22,   // inner bowl: rounded rectangle (straight half-lengths + corner radius)
  zc: -0.5,                 // pitch centre line in z (68 cells: -34..33)
};
// Distance outward from the inner edge of the stands (negative on the pitch side).
function cnR(x, z) {
  const qx = Math.abs(x + 0.5) - CN.hx, qz = Math.abs(z + 0.5 - CN.zc) - CN.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - CN.rc;
}
// 0..1 position round the bowl (increasing to the right as seen from the pitch)
function cnT(x, z) { return (Math.atan2(z + 0.5 - CN.zc, x + 0.5) / (Math.PI * 2) + 1) % 1; }
function cnRay(x, z, n) { return Math.floor(cnT(x, z) * n); }
// Distance travelled round the bowl (anticlockwise, from the +x end) along the rounded rectangle
// that is d blocks out from the inner edge: lettering follows it without skipping columns.
function cnArc(x, z, d) {
  const X = x + 0.5, Z = z + 0.5 - CN.zc, hx = CN.hx, hz = CN.hz, R = CN.rc + d, q = R * Math.PI / 2;
  const P = 4 * hx + 4 * hz + 4 * q;
  let s;
  if (X >= hx && Math.abs(Z) <= hz) s = Z;
  else if (Z >= hz && Math.abs(X) <= hx) s = hz + q + (hx - X);
  else if (X <= -hx && Math.abs(Z) <= hz) s = hz + 2 * q + 2 * hx + (hz - Z);
  else if (Z <= -hz && Math.abs(X) <= hx) s = 3 * hz + 3 * q + 2 * hx + (X + hx);
  else if (X > hx && Z > hz) s = hz + Math.atan2(Z - hz, X - hx) * R;
  else if (X < -hx && Z > hz) s = hz + q + 2 * hx + Math.atan2(-X - hx, Z - hz) * R;
  else if (X < -hx && Z < -hz) s = 3 * hz + 2 * q + 2 * hx + Math.atan2(-Z - hz, -X - hx) * R;
  else s = 3 * hz + 3 * q + 4 * hx + Math.atan2(X - hx, -Z - hz) * R;
  return ((s % P) + P) % P;
}

// 5x7 capitals
const CN_FONT = {
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function cnText(text, col, row) {
  if (row < 0 || row > 6 || col < 0) return false;
  const i = Math.floor(col / 6), k = col % 6;
  if (i >= text.length || k === 5) return false;
  const g = CN_FONT[text[i]];
  return !!g && g[row][k] === '1';
}

const CN_BLACK = B.WOOL + 15;
const CN_CONCRETE = B.SMOOTH_STONE;
const CN_MOTTO = 'MES QUE UN CLUB   ';

// Outward direction of the bowl at a column, snapped to an axis: 0 +X, 1 -X, 4 +Z, 5 -Z.
function cnOut(x, z) {
  const X = x + 0.5, Z = z + 0.5 - CN.zc;
  const px = Math.max(Math.abs(X) - CN.hx, 0), pz = Math.max(Math.abs(Z) - CN.hz, 0);
  return px > pz ? (X > 0 ? 0 : 1) : (Z > 0 ? 4 : 5);
}
const CN_DIR = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] };
const CN_OPP = { 0: 1, 1: 0, 4: 5, 5: 4 };
function cnHash(x, z) { return (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(x ^ z, 83492791)) >>> 0; }

// A tier: rows of `widths` cells (the last cell of each row carries the seat, the others are
// legroom), each row one block higher than the one in front.
function cnTier(c0, widths, top0) {
  const t = { c0, top: [], seat: [], row: [], rows: widths.length, end: c0 };
  widths.forEach((w, i) => { for (let k = 0; k < w; k++) { t.top.push(top0 + i); t.seat.push(k === w - 1); t.row.push(i); } });
  t.end = c0 + t.top.length;
  return t;
}
const rep = (a, n) => [].concat(...Array.from({ length: n }, () => a));
// Lower tier: 10 two-block rows from 2 m above the grass to street level (the pitch is sunk).
const CN_T1 = cnTier(3, rep([2], 10), CN.G + 2);
// Middle tier: cantilevers over the back of the lower one; its front carries the first LED ring.
const CN_T2 = cnTier(21, rep([2, 1], 8), CN.G + 24);
// Upper tier: the steepest, above the double VIP ring and the second LED ring.
const CN_T3 = cnTier(48, rep([1, 1, 2], 4).concat([1, 1]), CN.G + 58);
function cnTierAt(t, c) { return c >= t.c0 && c < t.end ? c - t.c0 : -1; }

// Facade: concourse floors (tops) and how far out each one reaches; the higher, the further.
const CN_FLOORS = [CN.S, CN.G + 25, CN.G + 38, CN.G + 51];
const CN_EAVE_TOP = CN.G + 63;
const CN_EDGE = [0, 69, 72, 75, 78];

// Seats: garnet-red with blue scattered through them, bluer at the front of the lower tier and the
// back of the upper one; the crest and the sponsor's roundel drawn in seats in the middle tier.
function cnSeatColor(x, z, tier, row, rows) {
  const f = row / (rows - 1), h = (cnHash(x, z) % 1000) / 1000;
  const pBlue = tier === 1 ? 0.62 - 0.44 * f : tier === 2 ? 0.2 : 0.16 + 0.42 * f;
  return h < pBlue ? B.SEAT_BLUE : B.SEAT_RED;
}
// FC Barcelona crest, 21 x 16 cells stretched 1.6x along the stand (row 0 at the top): St George's cross and the Senyera, the band with
// the initials, the blaugrana stripes with the ball, all outlined in gold.
const CN_INITIALS = { F: ['111', '100', '110', '100', '100'], C: ['111', '100', '100', '100', '111'], B: ['110', '101', '110', '101', '110'] };
function cnCrest(col, row) {
  if (col < 0 || col > 20 || row < 0 || row > 15) return 0;
  const dc = Math.abs(col - 10);
  const hw = row <= 11 ? 10.5 : 10.5 - (row - 11) * 2.6;
  if (dc > hw) return 0;
  if (row === 0 && (dc === 10 || dc === 0)) return 0;
  if (dc > hw - 1 || row === 0 || row === 5 || row === 11) return B.SEAT_YELLOW;
  if (row <= 4) {
    if (col === 10) return B.SEAT_YELLOW;
    if (col < 10) return col === 5 || row === 2 ? B.SEAT_RED : B.SEAT_WHITE;
    return col % 2 ? B.SEAT_RED : B.SEAT_YELLOW;
  }
  if (row <= 10) {
    for (const [ch, c0] of [['F', 3], ['C', 9], ['B', 15]]) {
      const k = col - c0;
      if (k >= 0 && k < 3 && CN_INITIALS[ch][row - 6][k] === '1') return B.SEAT_BLUE;
    }
    return B.SEAT_WHITE;
  }
  if (row >= 12 && row <= 13 && dc <= 1) return B.SEAT_YELLOW;
  return (col >> 1) & 1 ? B.SEAT_BLUE : B.SEAT_RED;
}
// Spotify's roundel with its three curved bars, 16 rows tall, stretched like the crest.
function cnRoundel(dx, dy) {
  if (dx * dx + dy * dy > 7.9 * 7.9) return 0;
  const bars = [[3.2, 5.2], [0.2, 4.4], [-2.6, 3.4]];
  for (const [y0, w] of bars) if (Math.abs(dx) <= w && Math.abs(dy - (y0 - 0.07 * dx * dx)) < 0.62) return B.SEAT_BLUE;
  return B.SEAT_YELLOW;
}
function cnMosaic(x, z, row) {
  const X = x + 0.5, Z = z + 0.5 - CN.zc;
  // crest across the middle tier opposite the main stand (left to right as seen from the pitch)
  if (Z > CN.hz && Math.abs(X) <= CN.hx) return cnCrest(Math.floor((16.5 - X) / 1.6), 15 - row);
  // the roundel behind both goals
  if (Math.abs(X) > CN.hx && Math.abs(Z) <= CN.hz) return cnRoundel(Z / 1.6, row - 7.5);
  return 0;
}

// Radial aisles every ~12 m of arc.
function cnAisle(x, z) {
  const dist = Math.hypot(x + 0.5, z + 0.5 - CN.zc), n = 104;
  return (cnT(x, z) * n) % 1 * (dist * Math.PI * 2 / n) < 1.2;
}

// White pitch markings.
function cnLine(x, z) {
  if (x < -52 || x > 52 || z < -34 || z > 33) return false;
  const dz = z - CN.zc;
  if (x === -52 || x === 52 || z === -34 || z === 33 || x === 0) return true;
  const near = (d, r) => Math.abs(d - r) < 0.55;
  if (near(Math.hypot(x, dz), 9.15) || Math.hypot(x, dz) < 0.8) return true;
  for (const s of [-1, 1]) {
    const ax = x * s;
    if (ax >= 36 && ax <= 52 && Math.round(Math.abs(dz)) === 20) return true;
    if (ax === 36 && Math.abs(dz) <= 20.2) return true;
    if (ax >= 47 && ax <= 52 && Math.round(Math.abs(dz)) === 9) return true;
    if (ax === 47 && Math.abs(dz) <= 9.2) return true;
    if (ax === 41 && Math.abs(dz) < 0.8) return true;
    if (ax < 36 && ax > 30 && near(Math.hypot(x - 41 * s, dz), 9.15)) return true;
  }
  for (const cx of [-52, 52]) for (const cz of [-34, 33]) if (near(Math.hypot(x - cx, z - cz), 1.2)) return true;
  return false;
}

// Players' tunnel: a glazed, retractable-style mouth on the pitch, then under the main stand to
// the dressing room.
function cnTunnel(x, z) { return z < -10 && Math.abs(x + 0.5) <= 1.5; }

function cnPitch(W, x, z) {
  const G = CN.G, set = (y, id, f) => W.set(x, y, z, id, f);
  if (cnLine(x, z)) set(G, B.SNOW);
  for (const s of [-1, 1]) {
    const gx = 53 * s, bx = 54 * s, cx = 55 * s;
    if (x === gx && (z === -4 || z === 3)) { set(G + 1, shapeId('marble', 'pillar')); set(G + 2, shapeId('marble', 'pillar')); set(G + 3, B.MARBLE); }
    if (x === gx && z > -4 && z < 3) set(G + 3, B.MARBLE);
    if ((x === bx || x === cx) && z >= -4 && z <= 3) { set(G + 1, B.COBWEB); set(G + 2, B.COBWEB); if (x === bx) set(G + 3, B.COBWEB); }
  }
  for (const fx of [-52, 52]) for (const fz of [-34, 33]) if (x === fx && z === fz) { set(G + 1, B.OAK_FENCE); set(G + 2, B.WOOL + 14); }
  // dugouts in front of the main stand: bucket seats under a glass canopy
  if (z >= -38 && z <= -36 && ((x >= -12 && x <= -4) || (x >= 4 && x <= 12))) {
    const edge = x === -12 || x === -4 || x === 4 || x === 12;
    if (z === -38 && !edge) set(G + 1, x < 0 ? B.SEAT_BLUE : B.SEAT_RED, 5);
    if (edge) for (let y = G + 1; y <= G + 2; y++) set(y, B.GLASS_PANE);
    set(G + 3, z === -38 ? B.PLASTER : B.GLASS);
  }
}

// A 360-degree LED ribbon: 8 blocks tall, the motto lit in yellow, background alternating blue
// and red with each repeat.
function cnRibbon(W, x, z, y0, d) {
  // stretch the lettering a hair so a whole number of mottos fits round the bowl (no seam)
  const len = CN_MOTTO.length * 6, P = 4 * CN.hx + 4 * CN.hz + 2 * Math.PI * (CN.rc + d);
  const pos = Math.floor(cnArc(x, z, d) * Math.round(P / len) * len / P), col = pos % len;
  const bg = Math.floor(pos / len) & 1 ? B.LED_RED : B.LED_BLUE;
  for (let row = 0; row < 8; row++) W.set(x, y0 + row, z, row === 0 ? CN_BLACK : cnText(CN_MOTTO, col, 7 - row) ? B.LED_YELLOW : bg);
}

function cnSeatRow(W, x, z, t, i, base, tier, out) {
  const top = t.top[i], set = (y, id, f) => W.set(x, y, z, id, f);
  for (let y = base; y <= top; y++) set(y, CN_CONCRETE);
  if (!t.seat[i]) return;
  const m = tier === 2 ? cnMosaic(x, z, t.row[i]) : 0;
  if (!m && cnAisle(x, z)) { if (i > 0 && !t.seat[i - 1]) set(top + 1, B.STONE_SLAB); return; }
  set(top + 1, m || cnSeatColor(x, z, tier, t.row[i], t.rows), out);
}

function cnColumn(W, x, z, r) {
  const G = CN.G, S = CN.S, c = Math.floor(r);
  const set = (y, id, f) => W.set(x, y, z, id, f);
  const clear = (y0, y1) => { for (let y = y0; y <= y1; y++) set(y, B.AIR); };
  const fill = (y0, y1, id) => { for (let y = y0; y <= y1; y++) set(y, id); };
  const out = cnOut(x, z), main = z < -10, ray = cnRay(x, z, 360);
  const tunnel = cnTunnel(x, z);
  if (c === 0) { set(G + 1, Math.floor(cnArc(x, z, 0.5) / 12) & 1 ? B.LED_RED : B.LED_BLUE); return; }
  if (c < 3) return;
  if (c > 66) { cnOutside(W, x, z, c); return; }

  // lower tier (the tunnel mouth cuts through its first rows)
  let i = cnTierAt(CN_T1, c);
  if (i >= 0 && !(tunnel && c <= 8)) cnSeatRow(W, x, z, CN_T1, i, G + 1, 1, out);
  if (c >= 23 && c <= 25) set(S, CN_CONCRETE);                 // walkway behind the lower tier

  // first LED ring on the front of the middle tier, lit soffit behind it
  if (c === 20) cnRibbon(W, x, z, G + 16, 20.5);
  i = cnTierAt(CN_T2, c);
  if (i >= 0) {
    const base = c <= 25 ? G + 17 : S + 1;
    if (c <= 25) set(G + 16, ray % 9 === 0 && c === 23 ? B.GLOWSTONE : B.ALU_SLATS);
    cnSeatRow(W, x, z, CN_T2, i, base, 2, out);
    // inner concourse ring behind the lower tier, entered through the aisles
    if (c === 26 && cnAisle(x, z)) clear(S + 1, S + 3);
    if (c >= 27 && c <= 30) { clear(S + 1, S + 4); if (c === 28 && ray % 8 === 0) set(S + 5, B.GLOWSTONE); set(S, B.DECK); }
    if (c === 31) fill(S + 1, S + 4, ray % 20 < 2 ? B.GLOWSTONE : B.PLASTER);
  }

  // double VIP ring between the middle and upper tiers
  const pres = main && Math.abs(x + 0.5) < 14;
  const wall = ray % 5 === 0;
  if (c >= 45 && c <= 51) {
    fill(S + 1, G + 38, CN_CONCRETE);
    set(G + 39, pres ? B.MARBLE : B.PLASTER);
    if (c === 45) set(G + 40, pres ? B.SEAT_RED : B.SEAT_WHITE, out);
    if (c === 46) { fill(G + 40, G + 43, B.GLASS_PANE); set(G + 44, B.PLASTER); set(G + 45, pres ? B.SEAT_RED : B.SEAT_WHITE, out); }
    if (c >= 47 && c <= 50) { if (wall) fill(G + 40, G + 43, B.PLASTER); set(G + 44, c === 49 && ray % 5 === 2 ? B.GLOWSTONE : B.PLASTER); }
    if (c === 51) fill(G + 40, G + 44, B.PLASTER);
    if (c === 47) { fill(G + 45, G + 48, B.GLASS_PANE); set(G + 49, B.PLASTER); cnRibbon(W, x, z, G + 50, 47.5); }
    if (c >= 48 && c <= 51 && wall) fill(G + 45, G + 48, B.PLASTER);
  }
  i = cnTierAt(CN_T3, c);
  if (i >= 0) cnSeatRow(W, x, z, CN_T3, i, c <= 51 ? G + 49 : S + 1, 3, out);
  if (c === 66) { fill(S + 1, G + 72, CN_CONCRETE); set(G + 73, B.GLASS_PANE); }

  // concourses carved into the back of the stands
  if (c >= 57) cnConcourses(W, x, z, c, ray);

  // the players' tunnel and the dressing room at its end
  if (tunnel && c <= 30) {
    set(G, CN_CONCRETE); clear(G + 1, G + 3);
    if (c <= 8) set(G + 4, B.GLASS);
    else if (c % 4 === 0) set(G + 4, B.GLOWSTONE);
    else set(G + 4, CN_CONCRETE);
  }
  if (main && tunnel === false && c <= 8 && Math.abs(x + 0.5) <= 2.5) { for (let y = G + 1; y <= G + 3; y++) set(y, B.GLASS_PANE); set(G + 4, B.GLASS); }
  if (main && c >= 29 && c <= 35 && Math.abs(x + 0.5) <= 9) {
    set(G, B.MARBLE); clear(G + 1, G + 4);
    set(G + 5, (x + c) % 4 === 0 ? B.GLOWSTONE : B.PLASTER);
    if (c === 35) set(G + 1, x & 1 ? B.SEAT_BLUE : B.SEAT_RED, out);
    if (c === 35 || Math.abs(x + 0.5) >= 8.5) for (let y = c === 35 ? G + 2 : G + 1; y <= G + 4; y++) set(y, B.PLASTER);
  }
}

// Concourse levels: a hollow ring inside the stands' back (lit kiosks on the inner wall), glazed
// at street level, open terraces with timber decks above.
function cnConcourses(W, x, z, c, ray) {
  const set = (y, id, f) => W.set(x, y, z, id, f);
  for (let k = 0; k < 4; k++) {
    const f = CN_FLOORS[k], next = k < 3 ? CN_FLOORS[k + 1] : CN_EAVE_TOP;
    for (let y = f + 1; y <= next - 2; y++) {
      if (c === 57) set(y, y === next - 3 && ray % 12 < 3 ? B.GLOWSTONE : y <= f + 3 && ray % 12 === 6 ? B.BARREL : B.STONE);
      else if (c === 62 && k === 0) set(y, ray % 24 === 0 && y <= f + 3 ? B.AIR : B.GLASS_PANE);
      else set(y, B.AIR);
    }
    if (c > 57) { set(f, k === 0 ? B.STONE_BRICKS : B.DECK); set(next - 1, B.ALU_SLATS); }
  }
  if (c > 57) set(CN_EAVE_TOP, B.PLASTER);
  // CAMP NOU across the street-level glazing of the main side
  if (z < -10 && c === 62 && Math.abs(x) < 40) {
    const col = 22 - x;
    for (let row = 0; row < 7; row++) if (cnText('CAMP NOU', col, row)) set(CN.S + 9 - row, B.MARBLE);
  }
}

// Outside the stands: cantilevered terraces (each reaching further out than the one below) with
// glass balustrades and white edges, light fins in blaugrana, big concrete columns, glass lift
// cores, grand stairs down to the plaza, and the plaza itself.
function cnOutside(W, x, z, c) {
  const G = CN.G, S = CN.S, set = (y, id, f) => W.set(x, y, z, id, f);
  const t = cnT(x, z), dist = Math.hypot(x + 0.5, z + 0.5 - CN.zc), out = cnOut(x, z);
  const ray = cnRay(x, z, 720);
  const arcIn = (n, w) => ((t * n + 0.5) % 1) * (dist * Math.PI * 2 / n) < w;   // a w-metre band n times round
  const stairs = arcIn(6, 9) && c >= 69 && c <= 80;
  // plaza
  if (c < 91 || (c > 103 && c < 110)) set(S, c % 12 === 0 ? B.STONE_BRICKS : CN_CONCRETE);
  if (c === 86 && arcIn(52, 1)) { for (let y = S + 1; y <= S + 5; y++) set(y, B.IRON_BARS); set(S + 6, B.LANTERN, 0); }
  if (c > 78) {
    if (stairs) { const top = G + 25 - (c - 68); for (let y = S + 1; y < top; y++) set(y, CN_CONCRETE); set(top, shapeId('plaster', 'stairs'), CN_OPP[out]); }
    return;
  }
  // terraces and eaves
  for (let k = 1; k <= 4; k++) {
    if (c >= CN_EDGE[k]) continue;
    const f = k < 4 ? CN_FLOORS[k] : CN_EAVE_TOP, edge = c === CN_EDGE[k] - 1;
    set(f, edge || k === 4 ? B.PLASTER : B.DECK);
    set(f - 1, edge ? B.PLASTER : ray % 7 === 0 && c === CN_EDGE[k] - 3 ? B.GLOWSTONE : B.ALU_SLATS);
    if (edge && k < 4 && !(k === 1 && arcIn(6, 9))) set(f + 1, B.GLASS_PANE);
    // light fins in some bays: vertical blaugrana blades just inside the balustrade
    if (k < 4 && c === CN_EDGE[k] - 2 && (Math.floor(t * 30) % 2 === 0) && ray % 3 === 0) {
      const next = k < 3 ? CN_FLOORS[k + 1] : CN_EAVE_TOP;
      for (let y = f + 2; y <= next - 3; y++) set(y, Math.floor(ray / 3) % 2 ? B.LED_BLUE : B.LED_RED);
    }
  }
  // arcade under the first terrace
  if (c < CN_EDGE[1]) set(S, B.STONE_BRICKS);
  // grand stairs up to the first terrace
  if (stairs) { const top = G + 25 - (c - 68); for (let y = S + 1; y < top; y++) set(y, CN_CONCRETE); set(top, shapeId('plaster', 'stairs'), CN_OPP[out]); }
  // columns carrying the terraces and, above them, the roof's compression ring
  const column = (t * 92) % 1 * (dist * Math.PI * 2 / 92) < 1.2;
  if (c === 67 && column) {
    for (let y = S + 1; y < CN_EAVE_TOP; y++) if (!CN_FLOORS.includes(y) && !CN_FLOORS.includes(y + 1)) set(y, CN_CONCRETE);
    for (let y = CN_EAVE_TOP + 1; y < G + 76; y++) set(y, shapeId('plaster', 'pillar'));
  }
  // the band of light between the top eave and the roof
  if (c === 67 && !column) for (let y = CN_EAVE_TOP + 1; y <= G + 72; y++) set(y, (ray >> 2) % 2 ? B.LED_BLUE : B.LED_RED);
  // glass lift cores
  if (c >= 67 && c <= 68 && arcIn(12, 3) && !arcIn(6, 9)) for (let y = S + 1; y <= G + 77; y++) set(y, (y - S) % 5 === 0 ? B.PLASTER : B.GLASS);
}

// Tensile roof: navy weather side, white underneath; translucent next to the open oculus, a lit
// tension ring at the inner edge, steel cables radiating out to the compression ring on the 92
// columns, the skywalk on top and a rim lit in blue and garnet at night.
function cnRoofLevel(c) {
  if (c < 2 || c > 82) return -1;
  return c <= 66 ? CN.G + 66 + Math.floor((c - 2) * 10 / 64) : CN.G + 76;
}
function cnRoof(W, x, z, r) {
  const c = Math.floor(r), L = cnRoofLevel(c), G = CN.G;
  if (L < 0) return;
  const set = (y, id, f) => W.set(x, y, z, id, f);
  const out = cnOut(x, z), [dx, dz] = CN_DIR[out];
  const memb = (cc) => cc >= 14 && cc <= 80;
  if (c === 2) { set(L, B.PLASTER); set(L - 1, cnAisle(x, z) ? B.GLOWSTONE : B.PLASTER); }
  else if (c < 14) set(L, B.GLASS);
  else if (c <= 80) set(L, B.MEMBRANE);
  else { for (let y = L - 4; y <= L + 1; y++) set(y, y === L - 1 ? ((cnT(x, z) * 8 | 0) & 1 ? B.LED_RED : B.LED_BLUE) : B.MEMBRANE); return; }
  // smooth the steps of the membrane with sloped pieces above and below
  const co = Math.floor(cnR(x + dx, z + dz)), ci = Math.floor(cnR(x - dx, z - dz));
  const Lo = cnRoofLevel(co), Li = cnRoofLevel(ci);
  let under = false;
  if (memb(c) && memb(co) && Lo === L + 1) set(L + 1, shapeId('membrane', 'slope'), out);
  if (memb(c) && memb(ci) && Li === L - 1) { set(L - 1, shapeId('membrane', 'slope'), CN_OPP[out] | 8); under = true; }
  // radial cables under the membrane
  const dist = Math.hypot(x + 0.5, z + 0.5 - CN.zc);
  if (!under && c >= 3 && c <= 66 && (cnT(x, z) * 92) % 1 * (dist * Math.PI * 2 / 92) < 0.9) set(L - 1, B.STONE_SLAB, 8);
  // compression ring and skywalk
  if (c >= 67) set(L - 1, B.PLASTER);
  if (c >= 68 && c <= 71) set(L, B.DECK);
  if (c === 67 || c === 72) set(L + 1, B.GLASS_PANE);
  if (c === 71 && cnRay(x, z, 180) % 6 === 0) set(L + 1, B.LANTERN, 0);
}

// Three 26 x 9 m video boards hanging from the roof: over each goal end and over the stand
// facing the main one.
function cnBoards(W, x, z) {
  const G = CN.G, y = G + 66;
  const board = (col, text) => {
    const off = Math.floor((26 - (text.length * 6 - 1)) / 2);
    for (let row = 0; row < 9; row++) {
      const frame = row === 0 || row === 8 || col === 0 || col === 25;
      W.set(x, G + 52 + row, z, frame ? CN_BLACK : cnText(text, col - off, 7 - row) ? B.LED_YELLOW : B.LED_BLUE);
    }
    if (col === 3 || col === 22) for (let yy = G + 61; yy < y; yy++) W.set(x, yy, z, B.IRON_BARS);
  };
  const dz = z + 0.5 - CN.zc;
  // text reads left to right from the pitch
  if (x === 64 && Math.abs(dz) < 13) board(Math.floor(dz + 12.5 + 0.5), 'FCB');
  if (x === -65 && Math.abs(dz) < 13) board(Math.floor(12.5 - dz + 0.5), 'NOU');
  if (z === 44 && Math.abs(x + 0.5) < 13) board(Math.floor(12.5 - (x + 0.5) + 0.5), 'CAMP');
}

WORLD_PRESETS.campnou = {
  name: 'Camp Nou', icon: '🏟️', words: [], time: 0.34, noCaves: true, hidden: true,
  // the bowl and the lower tier sit in a pit; everything else starts at street level
  height(g, x, z) { return cnR(x, z) < 23 ? CN.G : CN.S; },
  column(g, x, z) {
    const r = cnR(x, z);
    const stripe = Math.floor((x + 52.5) / 5.25) & 1;
    const tint = r < 3 ? (stripe ? [[0.74, 1.26, 0.5], [0.66, 1.1, 0.5]] : [[0.5, 0.9, 0.36], [0.5, 0.9, 0.36]]) : [[0.72, 1.06, 0.56], [0.72, 1.06, 0.56]];
    return col({ top: B.GRASS, filler: B.DIRT, depth: 3, level: 0, tint, biome: BIOME.PLAINS });
  },
  plant(g, x, z, h, ground, rr) {
    const r = cnR(x, z);
    if (r > 110 && ground === B.GRASS && rr < 0.12) return { ids: [rr < 0.03 ? B.DANDELION : B.TALLGRASS] };
    return null;
  },
  trees: { cell: 8, R: 4 },
  tree(g, x, z, h, r) {
    const d = cnR(x, z);
    // a double row of trees round the esplanade, then scattered ones
    if ((d > 92 && d < 95) || (d > 99 && d < 102)) return r < 0.8 ? { kind: 'oak' } : null;
    return d > 111 && d < 150 && r < 0.3 ? { kind: r < 0.1 ? 'birch' : 'oak' } : null;
  },
  spawn() { return { pos: [0.5, CN.G + 1, -6.5], yaw: Math.PI, pitch: 0.12 }; },
  water: WATER_STYLE.river,
  build(g, chunk) {
    const W = structWriter(chunk);
    for (let z = W.z0; z <= W.z1; z++) for (let x = W.x0; x <= W.x1; x++) {
      const r = cnR(x, z);
      if (r > 110) continue;
      if (r < 0) cnPitch(W, x, z); else cnColumn(W, x, z, r);
      cnRoof(W, x, z, r);
      cnBoards(W, x, z);
    }
  },
};
