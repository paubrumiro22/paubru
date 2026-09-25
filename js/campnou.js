'use strict';
// A private showcase world: FC Barcelona's stadium as it will look once the current rebuild is
// finished (Nikken Sekkei + Pascual i Ausió design), at real scale (1 block = 1 m, about
// 260 x 225 m and 53 m high). Inside: the 105 x 68 pitch with mowing stripes and markings, goals
// with nets, dugouts and tunnel; three tiers in blue and garnet with the club's motto in the
// seats, the raised VIP ring and the box band whose fronts carry the two 360-degree LED ribbons,
// and three 26 x 9 m video boards hanging from the roof. Outside: the open facade of concourse
// rings under wide white eaves (wood-slatted soffits, glass balustrades, vertical cores, CAMP NOU
// on the glass) and the tensile roof over every seat, translucent near the pitch, solar panels in
// the middle, white outside with a blue-and-garnet striped rim. Everything is computed per column
// from the stadium's shape, so chunks build it independently (in workers too). No crests or
// sponsor logos are reproduced.

const CN = {
  G: 40,                    // grass level (players stand at G + 1)
  hx: 35, hz: 16, rc: 22,   // inner bowl: rounded rectangle (straight half-lengths + corner radius)
  zc: -0.5,                 // pitch centre line in z (68 cells: -34..33)
  standEnd: 60,             // back of the stands (concourses begin)
  facade: 70,               // glass balustrades of the concourses
  eave: 72,                 // outer edge of the eaves
  roof: 80,                 // outer edge of the roof
  roofY: 52,                // roof height above the grass
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

const CN_BLUE = B.WOOL + 11, CN_GARNET = B.WOOL + 14, CN_YELLOW = B.WOOL + 4, CN_BLACK = B.WOOL + 15, CN_PINK = B.WOOL + 6;
const CN_CONCRETE = B.SMOOTH_STONE;
const CN_MOTTO = 'MES QUE UN CLUB   ';

// Seating profile: { top, kind } for distance r from the inner edge of the stands.
function cnProfile(r) {
  const G = CN.G;
  if (r < 1) return { top: G + 1, kind: 'boards' };
  if (r < 3) return { top: G, kind: 'walk' };
  if (r < 24) return { top: G + 2 + Math.floor((r - 3) * 0.6), kind: 'tier1' };
  if (r < 27) return { top: G + 21, kind: 'band', lo: G + 14, face: 25 };   // raised VIP ring
  if (r < 38) return { top: G + 22 + Math.floor((r - 27) * 0.7), kind: 'tier2' };
  if (r < 41) return { top: G + 37, kind: 'band', lo: G + 30, face: 39 };   // boxes between 2nd and 3rd tier
  if (r < CN.standEnd) return { top: G + 38 + Math.floor((r - 41) * 0.6), kind: 'tier3' };
  if (r < CN.roof) return { top: G, kind: 'facade' };
  return { top: G, kind: 'plaza' };
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

// Facade levels: concourse floors and the eaves over them.
const CN_FLOORS = [0, 12, 24, 36];
const CN_EAVES = [9, 21, 33];

function cnPitch(W, x, z) {
  const G = CN.G, set = (y, id, f) => W.set(x, y, z, id, f);
  if (cnLine(x, z)) set(G, B.SNOW);
  for (const s of [-1, 1]) {
    const gx = 53 * s, bx = 54 * s, cx = 55 * s;
    if (x === gx && (z === -4 || z === 3)) { set(G + 1, shapeId('marble', 'pillar')); set(G + 2, shapeId('marble', 'pillar')); set(G + 3, B.MARBLE); }
    if (x === gx && z > -4 && z < 3) set(G + 3, B.MARBLE);
    if ((x === bx || x === cx) && z >= -4 && z <= 3) { set(G + 1, B.COBWEB); set(G + 2, B.COBWEB); if (x === bx) set(G + 3, B.COBWEB); }
  }
  for (const fx of [-52, 52]) for (const fz of [-34, 33]) if (x === fx && z === fz) { set(G + 1, B.OAK_FENCE); set(G + 2, B.WOOL + 1); }
  // dugouts on the main-stand side
  if (z >= -38 && z <= -36 && ((x >= -12 && x <= -4) || (x >= 4 && x <= 12))) {
    const edge = x === -12 || x === -4 || x === 4 || x === 12;
    if (z === -38) set(G + 1, shapeId('plaster', 'stairs'), 5);
    if (edge || z === -38) { set(G + 2, B.GLASS_PANE); if (edge) set(G + 1, B.GLASS_PANE); }
    set(G + 3, z === -36 ? shapeId('plaster', 'slope') : B.PLASTER, 4);
  }
}

// A 360-degree LED ribbon: 8 blocks tall, the motto lit in yellow on blue round the whole bowl.
function cnRibbon(W, x, z, y0, d) {
  // stretch the lettering a hair so a whole number of mottos fits round the bowl (no seam)
  const len = CN_MOTTO.length * 6, P = 4 * CN.hx + 4 * CN.hz + 2 * Math.PI * (CN.rc + d);
  const col = Math.floor(cnArc(x, z, d) * Math.round(P / len) * len / P) % len;
  for (let row = 0; row < 8; row++) {
    W.set(x, y0 + row, z, row === 0 ? CN_BLACK : cnText(CN_MOTTO, col, 7 - row) ? B.GLOWSTONE : CN_BLUE);
  }
}

function cnColumn(W, x, z) {
  const G = CN.G;
  const r = cnR(x, z);
  const set = (y, id, f) => W.set(x, y, z, id, f);
  if (r < 0) { cnPitch(W, x, z); return; }
  const P = cnProfile(r);
  const mainSide = z < -10;
  if (P.kind === 'plaza') {
    set(G, Math.floor(r) % 12 === 0 ? B.STONE_BRICKS : CN_CONCRETE);
    if (r > 86 && r < 87 && cnAisle(x, z) && (cnRay(x, z, 104) & 1)) { for (let y = G + 1; y <= G + 5; y++) set(y, B.IRON_BARS); set(G + 6, B.LANTERN, 0); }
    return;
  }
  if (P.kind === 'facade') { cnFacade(W, x, z, r); return; }
  for (let y = G; y < P.top; y++) set(y, CN_CONCRETE);
  switch (P.kind) {
    case 'boards': set(G + 1, [CN_BLUE, CN_GARNET, CN_YELLOW][Math.floor((cnT(x, z) * 70 % 1) * 3)]); break;
    case 'walk': set(G, CN_CONCRETE); break;
    case 'tier1': case 'tier2': case 'tier3': {
      let seat = P.kind === 'tier2' ? CN_GARNET : CN_BLUE;
      let motto = false;
      // the motto across the lower tier opposite the main stand
      if (P.kind === 'tier1' && z > 20) {
        const lvl = P.top - (G + 2) - 2, col = 45 - x;
        if (lvl >= -1 && lvl <= 7 && col >= -2 && col <= 91) { motto = true; seat = cnText('MES QUE UN CLUB', col, 6 - lvl) ? CN_YELLOW : CN_GARNET; }
      }
      if (P.kind === 'tier3' && Math.abs(x) > 55) seat = (cnRay(x, z, 90) & 1) ? CN_BLUE : CN_GARNET;
      set(P.top, cnAisle(x, z) && !motto ? CN_CONCRETE : seat);
      break;
    }
    case 'band': {
      // the box fronts carry the LED ribbons; glazed boxes behind
      set(P.top, CN_CONCRETE);
      if (r < P.face) cnRibbon(W, x, z, P.lo, P.face - 0.5);
      else if (r < P.face + 1) for (let y = P.lo; y < P.top; y++) set(y, y === P.lo ? B.PLASTER : B.GLASS_PANE);
      break;
    }
    default: break;
  }
  // players' tunnel under the main stand
  if (mainSide && Math.abs(x + 0.5) <= 1.5 && r < 12) { for (let y = G + 1; y <= G + 3; y++) set(y, B.AIR); if (r > 10) set(G + 4, CN_CONCRETE); }
}

// Open facade: concourse floors with glass balustrades under wide white eaves that rise a little
// towards the street, wood slats under them, glass lift/stair cores, the name on the glass.
function cnFacade(W, x, z, r) {
  const G = CN.G, set = (y, id, f) => W.set(x, y, z, id, f);
  const ray = cnRay(x, z, 260);
  // back wall of the stands (inner side of the concourses): light render with glazed openings
  if (r < CN.standEnd + 1) {
    for (let y = G; y <= G + CN.roofY - 1; y++) {
      const k = (y - G) % 12;
      set(y, k >= 2 && k <= 7 && ray % 6 === 0 ? B.GLASS_PANE : k >= 1 && k <= 3 && ray % 18 === 3 ? B.AIR : B.PLASTER);
    }
    return;
  }
  for (const f of CN_FLOORS) {
    if (f === 0) {
      if (r < CN.facade - 2) set(G, CN_CONCRETE);
      // ground-floor atrium: glass all round, with doors
      if (r >= CN.facade - 3 && r < CN.facade - 2) for (let y = G + 1; y <= G + 8; y++) set(y, cnRay(x, z, 180) % 12 === 0 && y <= G + 3 ? B.AIR : B.GLASS_PANE);
    } else {
      if (r < CN.facade) set(G + f, r >= CN.facade - 2 ? B.PLASTER : CN_CONCRETE);
      if (r >= CN.facade - 1 && r < CN.facade) set(G + f + 1, B.GLASS_PANE);   // balustrade
    }
  }
  // eaves: wood slats underneath, white plaster on top, one block higher over the street
  CN_EAVES.forEach((e, i) => {
    const edge = CN.eave + i * 2;           // each eave reaches a little further than the one below
    if (r >= edge) return;
    const lift = r >= 64 ? 1 : 0;
    // wood slats with downlights set into them
    const lamp = (r >= 63 && r < 64) || (r >= 67 && r < 68);
    set(G + e + lift, lamp && ray % 5 === 0 ? B.GLOWSTONE : ray % 2 ? B.SPRUCE_PLANKS : B.BIRCH_PLANKS);
    set(G + e + lift + 1, B.PLASTER);
    set(G + e + lift + 2, B.PLASTER);
    if (r >= edge - 1) set(G + e + lift + 3, B.PLASTER);
  });
  // glass lift and stair cores through every level
  const core = (cnRay(x, z, 16) & 1) === 0 && (cnT(x, z) * 16) % 1 < 0.06 && r < CN.facade - 1;
  if (core) for (let y = G + 1; y <= G + CN.roofY - 1; y++) set(y, (y - G) % 4 === 0 ? B.PLASTER : B.GLASS_PANE);
  // the name on the first concourse's glass, main side, reading from the street
  if (z < -10 && r >= CN.facade - 1 && r < CN.facade && Math.abs(x) < 40) {
    const col = 22 - x;
    for (let row = 0; row < 7; row++) if (cnText('CAMP NOU', col, row)) set(G + 20 - row, B.MARBLE);
  }
}

// Tensile roof over every seat, three video boards hanging from it.
function cnRoof(W, x, z) {
  const r = cnR(x, z), G = CN.G, y = G + CN.roofY;
  if (r >= 2 && r < CN.roof) {
    let id = r < 18 ? B.GLASS : r < 44 ? B.SOLAR_PANEL : B.PLASTER;
    if (r >= 44 && cnRay(x, z, 208) % 4 === 0) id = CN_CONCRETE;   // membrane ribs
    if (r < 3) id = B.PLASTER;                                      // inner tension ring
    W.set(x, y, z, id);
    if (r >= CN.roof - 6) {
      const k = cnRay(x, z, 312) % 3;   // lit rim: blue, garnet and light stripes
      W.set(x, y - 1, z, k === 0 ? CN_BLUE : k === 1 ? CN_GARNET : B.GLOWSTONE);
      W.set(x, y + 1, z, B.PLASTER);
      if (r >= CN.roof - 1) { W.set(x, y + 2, z, B.PLASTER); W.set(x, y - 2, z, B.PLASTER); }
    }
    if (r >= 3 && r < 4 && cnAisle(x, z)) W.set(x, y - 1, z, B.GLOWSTONE);   // floodlights
  }
  // three 26 x 9 m video boards: over each goal end and over the stand facing the main one
  const board = (col, text) => {
    const off = Math.floor((26 - (text.length * 6 - 1)) / 2);
    for (let row = 0; row < 9; row++) {
      const frame = row === 0 || row === 8 || col === 0 || col === 25;
      W.set(x, G + 42 + row, z, frame ? CN_BLACK : cnText(text, col - off, 7 - row) ? B.GLOWSTONE : (row + col) % 7 === 0 ? CN_PINK : CN_BLUE);
    }
    if (col === 3 || col === 22) for (let yy = G + 51; yy < y; yy++) W.set(x, yy, z, B.IRON_BARS);
  };
  const dz = z + 0.5 - CN.zc;
  // text reads left to right from the pitch
  if (x === 64 && Math.abs(dz) < 13) board(Math.floor(dz + 12.5 + 0.5), 'NOU');
  if (x === -65 && Math.abs(dz) < 13) board(Math.floor(12.5 - dz + 0.5), 'NOU');
  if (z === 44 && Math.abs(x + 0.5) < 13) board(Math.floor(12.5 - (x + 0.5) + 0.5), 'CAMP');
}

WORLD_PRESETS.campnou = {
  name: 'Camp Nou', icon: '🏟️', words: [], time: 0.34, noCaves: true, hidden: true,
  height() { return CN.G; },
  column(g, x, z) {
    const r = cnR(x, z);
    const stripe = Math.floor((x + 52.5) / 5.25) & 1;
    const tint = r < 0 ? (stripe ? [[0.74, 1.26, 0.5], [0.66, 1.1, 0.5]] : [[0.5, 0.9, 0.36], [0.5, 0.9, 0.36]]) : [[0.72, 1.06, 0.56], [0.72, 1.06, 0.56]];
    return col({ top: B.GRASS, filler: B.DIRT, depth: 3, level: 0, tint, biome: BIOME.PLAINS });
  },
  plant(g, x, z, h, ground, rr) {
    const r = cnR(x, z);
    if (r > 104 && ground === B.GRASS && rr < 0.12) return { ids: [rr < 0.03 ? B.DANDELION : B.TALLGRASS] };
    return null;
  },
  trees: { cell: 8, R: 4 },
  tree(g, x, z, h, r) {
    const d = cnR(x, z);
    // a double row of trees round the esplanade, then scattered ones
    if ((d > 92 && d < 95) || (d > 99 && d < 102)) return r < 0.8 ? { kind: 'oak' } : null;
    return d > 104 && d < 140 && r < 0.3 ? { kind: r < 0.1 ? 'birch' : 'oak' } : null;
  },
  spawn() { return { pos: [0.5, CN.G + 1, -6.5], yaw: Math.PI, pitch: 0.12 }; },
  water: WATER_STYLE.river,
  build(g, chunk) {
    const W = structWriter(chunk);
    for (let z = W.z0; z <= W.z1; z++) for (let x = W.x0; x <= W.x1; x++) {
      if (cnR(x, z) > 110) continue;
      cnColumn(W, x, z);
      cnRoof(W, x, z);
    }
  },
};
