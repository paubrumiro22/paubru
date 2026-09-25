'use strict';
// A private showcase world: FC Barcelona's stadium in Barcelona as rebuilt in the 2020s, at
// real scale (1 block = 1 m). Pitch 105 x 68 with its mowing stripes and markings, goals with
// nets, dugouts and the players' tunnel; a three-tier bowl in blue and garnet with the club's
// motto in the seats, glazed hospitality bands between tiers; outside, the new facade of white
// cantilevered terraces and the roof with its 360-degree LED ring. Everything is computed per
// column from the stadium's shape, so chunks build it independently (and in workers).
// No club crest or sponsor logos are reproduced.

const CN = {
  G: 40,                 // grass level (players stand at G + 1)
  hx: 36, hz: 17, rc: 24, // inner bowl: rounded rectangle, half extents of its straight part + corner radius
  zc: -0.5,              // pitch centre line in z (68 cells: -34..33)
};
// Distance outward from the inner edge of the stands (negative on the pitch side).
function cnR(x, z) {
  const qx = Math.abs(x + 0.5) - CN.hx, qz = Math.abs(z + 0.5 - CN.zc) - CN.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - CN.rc;
}

// 5x7 capitals for the motto and the facade lettering
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
// pixel of a text laid out left to right; col, row from the text's top-left
function cnText(text, col, row) {
  if (row < 0 || row > 6 || col < 0) return false;
  const i = Math.floor(col / 6), k = col % 6;
  if (i >= text.length || k === 5) return false;
  const g = CN_FONT[text[i]];
  return !!g && g[row][k] === '1';
}

const CN_BLUE = B.WOOL + 11, CN_GARNET = B.WOOL + 14, CN_YELLOW = B.WOOL + 4, CN_BLACK = B.WOOL + 15;
const CN_CONCRETE = B.SMOOTH_STONE;

// Seating profile: returns { top, kind } for distance r from the inner edge.
function cnProfile(r) {
  const G = CN.G;
  if (r < 1) return { top: G + 1, kind: 'boards' };
  if (r < 3) return { top: G, kind: 'walk' };
  if (r < 30) return { top: G + 2 + Math.floor((r - 3) * 0.55), kind: 'tier1', row: Math.floor(r - 3) };
  if (r < 33) return { top: G + 22, kind: 'band1' };
  if (r < 47) return { top: G + 23 + Math.floor((r - 33) * 0.62), kind: 'tier2', row: Math.floor(r - 33) };
  if (r < 50) return { top: G + 37, kind: 'band2' };
  if (r < 70) return { top: G + 38 + Math.floor((r - 50) * 0.72), kind: 'tier3', row: Math.floor(r - 50) };
  if (r < 72) return { top: G + 53, kind: 'rim' };
  if (r < 79) return { top: G, kind: 'facade' };
  return { top: G, kind: 'plaza' };
}

// Aisles: thin radial stripes every ~12 m of arc.
function cnAisle(x, z) {
  const ang = Math.atan2(z + 0.5, x + 0.5), dist = Math.hypot(x + 0.5, z + 0.5);
  const n = 96, f = ((ang / (Math.PI * 2)) * n % 1 + 1) % 1;
  return f * (dist * Math.PI * 2 / n) < 1.2;
}

// Is this pitch cell a white line?
function cnLine(x, z) {
  const px = x, pz = z;
  if (px < -52 || px > 52 || pz < -34 || pz > 33) return false;
  const zc = CN.zc, dz = pz - zc;
  if (px === -52 || px === 52 || pz === -34 || pz === 33 || px === 0) return true;
  const near = (d, r) => Math.abs(d - r) < 0.55;
  if (near(Math.hypot(px, dz), 9.15)) return true;
  if (Math.hypot(px, dz) < 0.8) return true;
  for (const s of [-1, 1]) {
    const ax = px * s;   // distance towards this goal
    // penalty area 16.5 deep, 40.3 wide; goal area 5.5 deep, 18.3 wide
    if (ax >= 36 && ax <= 52 && (Math.round(Math.abs(dz)) === 20) ) return true;
    if (ax === 36 && Math.abs(dz) <= 20.2) return true;
    if (ax >= 47 && ax <= 52 && Math.round(Math.abs(dz)) === 9) return true;
    if (ax === 47 && Math.abs(dz) <= 9.2) return true;
    if (ax === 41 && Math.abs(dz) < 0.8) return true;
    if (ax < 36 && ax > 30 && near(Math.hypot(px - 41 * s, dz), 9.15)) return true;
  }
  for (const cx of [-52, 52]) for (const cz of [-34, 33]) if (near(Math.hypot(px - cx, pz - cz), 1.2) && Math.abs(px) <= 52 && pz >= -34 && pz <= 33) return true;
  return false;
}

// One column of the stadium (writes into the chunk through W).
function cnColumn(W, x, z) {
  const G = CN.G;
  const r = cnR(x, z);
  const set = (y, id, f) => W.set(x, y, z, id, f);
  // ---- pitch and its surround ----
  if (r < 0) {
    if (cnLine(x, z)) set(G, B.SNOW);
    // goals: posts 7.32 apart, crossbar at 2.44, nets behind
    for (const s of [-1, 1]) {
      const gx = 53 * s, bx = 54 * s, cx = 55 * s;
      if (x === gx && (z === -4 || z === 3)) { set(G + 1, shapeId('marble', 'pillar')); set(G + 2, shapeId('marble', 'pillar')); set(G + 3, B.MARBLE); }
      if (x === gx && z > -4 && z < 3) set(G + 3, B.MARBLE);
      if ((x === bx || x === cx) && z >= -4 && z <= 3) { set(G + 1, B.COBWEB); set(G + 2, B.COBWEB); if (x === bx) set(G + 3, B.COBWEB); }
      if ((x === bx || x === cx) && (z === -4 || z === 3)) { set(G + 1, B.COBWEB); set(G + 2, B.COBWEB); }
    }
    // corner flags
    for (const fx of [-52, 52]) for (const fz of [-34, 33]) if (x === fx && z === fz) { set(G + 1, B.OAK_FENCE); set(G + 2, B.WOOL + 1); }
    // dugouts on the main-stand side, either side of the halfway line
    if (z >= -40 && z <= -38 && ((x >= -12 && x <= -4) || (x >= 4 && x <= 12))) {
      const edge = x === -12 || x === -4 || x === 4 || x === 12;
      if (z === -38) { if (edge) { set(G + 1, B.GLASS_PANE); set(G + 2, B.GLASS_PANE); } }
      else { set(G + 1, z === -40 ? shapeId('plaster', 'stairs') : B.AIR, 5); if (edge) { set(G + 1, B.GLASS_PANE); set(G + 2, B.GLASS_PANE); } }
      set(G + 3, z === -38 ? shapeId('plaster', 'slope') : B.PLASTER, 4);
      if (z === -40) set(G + 2, B.GLASS_PANE);
    }
    return;
  }
  const P = cnProfile(r);
  const ang = Math.atan2(z + 0.5, x + 0.5);
  if (P.kind === 'plaza') {
    set(G, CN_CONCRETE);
    // lamp posts around the esplanade
    if (r > 84 && r < 85 && cnAisle(x * 1, z * 1) && hash3(x, 1, z, 5) < 0.35) { for (let y = G + 1; y <= G + 5; y++) set(y, B.IRON_BARS); set(G + 6, B.LANTERN, 0); }
    return;
  }
  // concrete body of the stands up to the seating surface
  const bodyTop = P.kind === 'facade' ? G : P.top - 1;
  for (let y = G; y <= bodyTop; y++) set(y, CN_CONCRETE);
  const aisle = cnAisle(x, z);
  const mainSide = z < -10;               // main stand (tribuna) on the -z side
  // players' tunnel under the main stand
  if (mainSide && Math.abs(x + 0.5) <= 1.5 && r < 12) { for (let y = G + 1; y <= G + 3; y++) set(y, B.AIR); if (r > 10) set(G + 4, CN_CONCRETE); }
  switch (P.kind) {
    case 'boards': {
      // LED advertising boards round the pitch
      const seg = Math.floor(((ang / (Math.PI * 2)) * 60 % 1 + 1) % 1 * 3);
      set(G + 1, [CN_BLUE, CN_GARNET, CN_YELLOW][seg]);
      set(G, CN_CONCRETE);
      return;
    }
    case 'walk': set(G, CN_CONCRETE); return;
    case 'tier1': case 'tier2': case 'tier3': {
      let seat = P.kind === 'tier2' ? CN_GARNET : CN_BLUE;
      let motto = false;
      // the motto across the lower tier opposite the main stand, yellow on garnet; one letter
      // pixel per seating step so it reads straight from the pitch
      if (P.kind === 'tier1' && z > 20) {
        const lvl = P.top - (CN.G + 2) - 3, col = 45 - x;
        if (lvl >= -1 && lvl <= 7 && col >= -2 && col <= 91) { motto = true; seat = cnText('MES QUE UN CLUB', col, 6 - lvl) ? CN_YELLOW : CN_GARNET; }
      }
      // behind the goals: blue and garnet stripes in the second tier
      if (P.kind === 'tier2' && Math.abs(x) > 60) seat = (Math.floor(ang * 20) & 1) ? CN_BLUE : CN_GARNET;
      if (aisle && !motto) set(P.top, CN_CONCRETE);
      else set(P.top, seat);
      // vomitories: a dark opening every so often at the back of a tier
      return;
    }
    case 'band1': case 'band2': {
      // glazed hospitality boxes between tiers
      const lo = P.kind === 'band1' ? G + 16 : G + 31;
      const front = P.kind === 'band1' ? r < 31 : r < 48;
      if (front) for (let y = lo; y < P.top; y++) set(y, y === lo || y === P.top - 1 ? B.PLASTER : B.GLASS_PANE);
      set(P.top, CN_CONCRETE);
      return;
    }
    case 'rim': {
      set(P.top, CN_CONCRETE);
      set(P.top + 1, B.GLASS_PANE);
      return;
    }
    case 'facade': {
      // the new facade: white terraces cantilevered every 7 m, glass behind, slender columns
      const G2 = CN.G;
      for (let y = G2 + 1; y <= G2 + 56; y++) {
        const level = (y - G2) % 7 === 0;
        if (r < 73) set(y, level ? B.PLASTER : B.GLASS_PANE);
        else if (level) set(y, B.PLASTER);
        else if (r >= 77 && r < 78 && cnAisle(x, z)) set(y, B.MARBLE);
        else if (r >= 78 && level === false && (y - G2) % 7 === 1) set(y, B.GLASS_PANE);
      }
      // the name along the top terrace, facing out on the main side
      if (mainSide && r >= 78 && r < 79 && Math.abs(x) < 40) {
        const col = 22 - x;   // reads left to right from outside
        for (let row = 0; row < 7; row++) if (cnText('CAMP NOU', col, row)) set(G2 + 54 - row, CN_YELLOW);
      }
      return;
    }
    default: break;
  }
}

// Roof over the stands: glass with a white outer band, the LED ring hanging from its inner edge,
// floodlights underneath.
function cnRoof(W, x, z) {
  const r = cnR(x, z), G = CN.G, y = G + 57;
  if (r < 25 || r >= 80) return;
  if (r < 27) {
    // 360-degree LED ring: the motto in light running round it on a blue band, garnet edges
    const t = (Math.atan2(z + 0.5, x + 0.5) / (Math.PI * 2) + 1) % 1;
    const col = Math.floor(t * 526) % 96;
    for (let yy = y - 8; yy <= y; yy++) {
      const row = yy - (y - 7);
      let id = row < 0 || row > 7 ? CN_GARNET : CN_BLUE;
      if (row >= 0 && row <= 6 && cnText('MES QUE UN CLUB', col, 6 - row)) id = B.GLOWSTONE;
      W.set(x, yy, z, id);
    }
    return;
  }
  W.set(x, y, z, r < 58 ? B.GLASS : B.PLASTER);
  if (r >= 27 && r < 28 && cnAisle(x, z)) W.set(x, y - 1, z, B.GLOWSTONE);
  if (r >= 58 && r < 59) W.set(x, y + 1, z, B.PLASTER);
}

WORLD_PRESETS.campnou = {
  name: 'Camp Nou', icon: '🏟️', words: [], time: 0.34, noCaves: true, hidden: true,
  height() { return CN.G; },
  column(g, x, z) {
    const r = cnR(x, z);
    // mowing stripes: every 5.25 m along the pitch the grass is lighter or darker
    const stripe = Math.floor((x + 52.5) / 5.25) & 1;
    const tint = r < 0 ? (stripe ? [[0.74, 1.26, 0.5], [0.66, 1.1, 0.5]] : [[0.5, 0.9, 0.36], [0.5, 0.9, 0.36]]) : [[0.72, 1.06, 0.56], [0.72, 1.06, 0.56]];
    return col({ top: B.GRASS, filler: B.DIRT, depth: 3, level: 0, tint, biome: BIOME.PLAINS });
  },
  plant(g, x, z, h, ground, rr) {
    const r = cnR(x, z);
    if (r > 95 && ground === B.GRASS && rr < 0.12) return { ids: [rr < 0.03 ? B.DANDELION : B.TALLGRASS] };
    return null;
  },
  trees: { cell: 9, R: 4 },
  tree(g, x, z, h, r) { const d = cnR(x, z); return d > 92 && d < 112 && r < 0.5 ? { kind: 'oak' } : null; },
  spawn() { return { pos: [0.5, CN.G + 1, -6.5], yaw: Math.PI, pitch: 0.12 }; },
  water: WATER_STYLE.river,
  build(g, chunk) {
    const W = structWriter(chunk);
    for (let z = W.z0; z <= W.z1; z++) for (let x = W.x0; x <= W.x1; x++) {
      const r = cnR(x, z);
      if (r > 120) continue;
      cnColumn(W, x, z);
      cnRoof(W, x, z);
    }
  },
};
