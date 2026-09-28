'use strict';
// The metro network and its control panel.
// - MetroNet follows the rails of the STUCOM line from Universitat in both directions (through
//   chunks that are not loaded too: saved edits first, else the generated terrain) and finds the
//   platforms by the Platform Track Marker under their track. Stations are named after line 1
//   of the Barcelona metro in order: ... Urgell, Universitat, Catalunya, Urquinaona, Arc de
//   Triomf ... The autopilot in metro.js runs the trains along this path.
// - The Metro Control Panel (a block in every station, also craftable) shows the line and lets
//   you add a station: pick the spot on the world map; the line is extended from the nearer end
//   that can reach it (straight on, or with one bend), with a tiled tunnel, a new station like the
//   others and a stair up to the street right where you picked. It is built over a few seconds
//   with the other players replaying the same build (op 'M') and the cloud keeping the blocks.

const METRO_L1_AFTER = ['Urquinaona', 'Arc de Triomf', 'Marina', 'Glòries', 'Clot', 'Navas', 'La Sagrera', 'Fabra i Puig', 'Sant Andreu',
  'Torras i Bages', 'Trinitat Vella', 'Baró de Viver', 'Santa Coloma', 'Fondo'];
const METRO_L1_BEFORE = ['Urgell', 'Rocafort', 'Espanya', 'Hostafrancs', 'Plaça de Sants', 'Mercat Nou', 'Santa Eulàlia', 'Torrassa', 'Florida',
  'Can Serra', 'Rambla Just Oliveras', 'Bellvitge'];
const METRO_STRIPES = [B.BLUE_TILES, B.CONCRETE + 14, B.CONCRETE + 4, B.CONCRETE + 5, B.CONCRETE + 1, B.CONCRETE + 10, B.CONCRETE + 9, B.CONCRETE + 6];
const MDIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // rail link directions (as RIDE_DIRV)
const mdirOf = (dx, dz) => (dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3);
const mface = (dx, dz) => (dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 4 : 5);   // block facing towards a direction

// a station name sign for every name the line can use
for (const n of [...METRO_L1_BEFORE, ...METRO_L1_AFTER]) {
  PIC_BUILTIN['metro_st_' + n] = { w: 3, h: 1, draw(g, W, H) {
    g.fillStyle = '#16213a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d6202b'; g.fillRect(18, 22, H - 44, H - 44);
    g.fillStyle = '#fff'; g.font = '900 96px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('M', 18 + (H - 44) / 2, H / 2 + 34);
    g.textAlign = 'left'; g.font = '700 ' + (n.length > 12 ? 46 : 60) + 'px Arial, sans-serif'; g.fillText(n, H + 6, H / 2 + 20);
  } };
}
const metroSign = (name) => (name === 'Universitat' ? 'metro_name' : name === 'Catalunya' ? 'metro_name2' : PIC_BUILTIN['metro_st_' + name] ? 'metro_st_' + name : 'metro');

const MetroNet = {
  cache: null, key: null, dirty: true, t: 0, gen: new Map(),

  get() {
    const w = G.world;
    if (!w || !w.gen || !w.gen.structs) return null;
    const key = w.seed + ':' + w.genVer;
    const now = performance.now();
    if (this.key !== key) { this.key = key; this.cache = null; this.gen.clear(); this.dirty = true; }
    if (this.dirty || now - this.t > 20000) {
      this.dirty = false; this.t = now;
      try { this.cache = this.trace(); } catch (e) { console.warn('Blocklands: metro trace', e); this.cache = null; }
    }
    return this.cache;
  },

  // a block anywhere: loaded, else a saved edit, else what the generator makes there
  block(x, y, z) {
    const w = G.world;
    if (y < 0 || y >= CH) return 0;
    if (w.isLoaded(x, z)) return w.getBlock(x, y, z);
    const k = chunkKey(x >> 4, z >> 4);
    const e = w.edits.get(k);
    if (e) { const id = e.get(blockIndex(x & 15, y, z & 15)); if (id !== undefined) return id; }
    let c = this.gen.get(k);
    if (!c) {
      c = new Chunk(x >> 4, z >> 4);
      w.gen.generate(c);
      this.gen.set(k, c);
      if (this.gen.size > 96) this.gen.delete(this.gen.keys().next().value);
    }
    return c.blocks[(y * CS + (z & 15)) * CS + (x & 15)];
  },
  // the top of the ground (edits and all) and whether it is water: the same for every player
  surface(x, z) {
    for (let y = CH - 2; y > 1; y--) {
      const id = this.block(x, y, z);
      if (IS_LIQUID(id)) return { h: y, water: true };
      if (BLOCK_SOLID[id] && !TREE_LEAVES.has(id) && !TREE_LOGS.has(id)) return { h: y, water: false };
    }
    return { h: 0, water: false };
  },
  links(x, y, z) { const i = RAIL_IDS.indexOf(this.block(x, y, z)); return i < 0 ? null : RAIL_LINKS[i]; },

  line() {
    const g = G.world.gen;
    const st = typeof stucomVillage === 'function' ? stucomVillage(g) : null;
    if (st && !st.metro) structuresIn(g, st.x, st.z, st.x, st.z);
    return st && st.metro && st.metro.line ? st.metro.line : null;
  },

  trace() {
    const L = this.line();
    if (!L) return null;
    const cell = (at) => [Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2])];
    const s0 = cell(L.stops[0].at);
    const l0 = this.links(s0[0], s0[1], s0[2]);
    if (!l0) return null;
    const walk = (c, dir) => {
      const out = [];
      let cur = c, d = dir;
      for (let n = 0; n < 4000; n++) {
        const nx = cur[0] + MDIRV[d][0], nz = cur[2] + MDIRV[d][1], back = (d + 2) & 3;
        let next = null, nl = null;
        for (const dy of [0, -1, 1]) {
          const l = this.links(nx, cur[1] + dy, nz);
          if (l && l.includes(back)) { next = [nx, cur[1] + dy, nz]; nl = l; break; }
        }
        if (!next) break;
        out.push(next);
        d = nl[0] === back ? nl[1] : nl[0];
        cur = next;
      }
      return out;
    };
    let path = walk(s0, l0[0]).reverse().concat([s0], walk(s0, l0[1]));
    const near = (at) => { let bi = 0, bd = Infinity; path.forEach((c, i) => { const d = Math.abs(c[0] - at[0]) + Math.abs(c[2] - at[2]) + Math.abs(c[1] - at[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
    if (near(L.stops[1].at) < near(L.stops[0].at)) path = path.reverse();
    const idx = new Map();
    path.forEach((c, i) => idx.set(posKey(c[0], c[1], c[2]), i));
    // platforms: runs of marked track; the old stops count where nothing is marked
    const stations = [];
    let run = null;
    path.forEach((c, i) => {
      const m = this.block(c[0], c[1] - 1, c[2]) === B.METRO_MARK;
      if (m && !run) run = { i0: i, i1: i };
      else if (m) run.i1 = i;
      if ((!m || i === path.length - 1) && run) { stations.push(run); run = null; }
    });
    for (const s of L.stops) {
      const i = near(s.at);
      if (!stations.some((q) => i >= q.i0 - 2 && i <= q.i1 + 2)) stations.push({ i0: i, i1: i });
    }
    stations.sort((a, b) => a.i0 - b.i0);
    for (const s of stations) { s.hp = Math.max(s.i0, s.i1 - 5); s.hm = Math.min(s.i1, s.i0 + 5); }
    // names: Universitat where the first stop is, then line 1 in both directions
    const iu = near(L.stops[0].at);
    let u = stations.findIndex((s) => iu >= s.i0 - 2 && iu <= s.i1 + 2);
    if (u < 0) u = 0;
    stations.forEach((s, i) => {
      const k = i - u;
      s.name = k === 0 ? 'Universitat' : k === 1 ? 'Catalunya' : k > 1 ? METRO_L1_AFTER[k - 2] || 'Station ' + (i + 1) : METRO_L1_BEFORE[-k - 1] || 'Station ' + (i + 1);
    });
    return { path, idx, stations, line: L };
  },

  near(p) {
    const N = this.get();
    if (!N) return false;
    for (let i = 0; i < N.path.length; i += 6) {
      const c = N.path[i];
      if (Math.abs(c[0] - p[0]) < 110 && Math.abs(c[2] - p[2]) < 110 && Math.abs(c[1] - p[1]) < 60) return true;
    }
    return false;
  },

  // the name the next station would take at each end
  nextName(end) {
    const N = this.get();
    if (!N) return 'Station';
    const u = N.stations.findIndex((s) => s.name === 'Universitat');
    const k = end > 0 ? N.stations.length - u : -(u + 1);
    return k === 0 ? 'Universitat' : k === 1 ? 'Catalunya' : k > 1 ? METRO_L1_AFTER[k - 2] || 'Station ' + (N.stations.length + 1) : METRO_L1_BEFORE[-k - 1] || 'Station ' + (N.stations.length + 1);
  },
};

// ---------------------------------------------------------------- planning a new station ----
// For a spot (x, z): extend from whichever end of the line can reach it, straight on or with one
// bend, and put the station so that its stair comes up there. Returns a plan or { reason }.
const MetroPlan = {
  make(x, z) {
    const N = MetroNet.get();
    if (!N || N.path.length < 3) return { reason: 'There is no metro line in this world.' };
    if (dimOf(x, z) !== DIM_OVER) return { reason: 'The metro only runs in the Overworld.' };
    const tries = [];
    for (const end of [-1, 1]) {
      const i = end > 0 ? N.path.length - 1 : 0, E = N.path[i], P2 = N.path[i - end];
      const e = [E[0] - P2[0], E[2] - P2[2]];
      if (Math.abs(e[0]) + Math.abs(e[1]) !== 1) continue;
      const n = [-e[1], e[0]];
      const t = (x - E[0]) * e[0] + (z - E[2]) * e[1], l = (x - E[0]) * n[0] + (z - E[2]) * n[1];
      const r = this.route(E, e, n, t, l, end);
      if (r.reason) tries.push(r); else tries.push(Object.assign(r, { end }));
    }
    const ok = tries.filter((r) => !r.reason).sort((a, b) => a.cells - b.cells);
    if (ok.length) { ok[0].name = MetroNet.nextName(ok[0].end); ok[0].x = Math.round(x); ok[0].z = Math.round(z); return ok[0]; }
    return tries.sort((a, b) => (b.score || 0) - (a.score || 0))[0] || { reason: 'The line cannot reach there.' };
  },

  route(E, e, n, t, l, end) {
    const P = E[1] + 1;
    // straight on when the spot is roughly ahead, otherwise one bend towards it
    if (Math.abs(l) <= 40) {
      const side = l < 0 ? -1 : 1;
      const m = [-side * n[0], -side * n[1]];            // local +a: from the platform towards the track
      return this.station(E, e, m, P, t, 0);
    }
    if (t < 10) return { reason: 'Too close to the line, or behind its end. Pick a spot further along.', score: 2 };
    const f = [Math.sign(l) * n[0], Math.sign(l) * n[1]];
    const K = [E[0] + e[0] * t, E[2] + e[1] * t];
    // the platform on the side the first leg comes from
    return this.station([K[0], E[1], K[1]], f, [e[0], e[1]], P, Math.abs(l), t);
  },

  // A station along the direction d from the point O (a rail cell or the bend), its stair top at
  // distance `along` from O. bend: length of the first leg when there is one.
  station(O, d, m, P, along, bend) {
    // find how deep the stair is where it comes up (the surface decides the number of steps)
    let steps = 13, top = null;
    for (let k = 0; k < 4; k++) {
      const dTop = 7 - steps;
      const c0 = along - dTop;                           // station centre along d from O
      const sx = O[0] + d[0] * (c0 + dTop) + (-m[0]) * 12, sz = O[2] + d[1] * (c0 + dTop) + (-m[1]) * 12;
      const sf = MetroNet.surface(Math.floor(sx), Math.floor(sz)), h = sf.h;
      top = { x: sx, z: sz, h, c0, water: sf.water };
      steps = h + 1 - P;
    }
    if (top.water || top.h < SEA) return { reason: 'The street there is under water.', score: 3 };
    if (steps < 9) return { reason: 'The ground there is too low for a station at this depth.', score: 3 };
    if (steps > 44) return { reason: 'The ground there is too high above the line (a hill).', score: 3 };
    const c0 = top.c0;
    if (c0 - 14 < 4) return { reason: 'Too close to the line, or behind its end. Pick a spot further along.', score: 1 };
    const cells = (bend || 0) + Math.round(c0 + 14);
    if (cells > 1600) return { reason: 'Too far: the tunnel would be over 1.6 km long.', score: 4 };
    return { O, d, m, P, c0, steps, F: P + steps, bend, cells, cost: 150 + Math.round(cells * 1.5) };
  },
};

// ---------------------------------------------------------------- building ----
const MetroBuild = {
  jobs: [],

  // All the blocks of a plan, in the order they go in (the tunnel from the line outwards).
  blocks(pl, E, e) {
    const out = new Map(), pics = [];
    const set = (x, y, z, id, f) => out.set(posKey(x, y, z), [x, y, z, id, f]);
    const { P, d, m, c0, F } = pl;
    const tunnelCell = (x, z, dv, nv, k, walls) => {
      for (let l = -2; l <= 2; l++) {
        const cx = x + nv[0] * l, cz = z + nv[1] * l;
        for (let y = P - 3; y <= P + 4; y++) {
          const wall = Math.abs(l) === 2, roof = y === P + 4 || (y === P + 3 && Math.abs(l) === 1);
          let id = B.AIR;
          if (y <= P - 2) id = y === P - 2 && !wall ? B.GRAVEL : B.CONCRETE + 7;
          else if (wall || roof) { if (!walls && wall) continue; id = y === P ? B.BLUE_TILES : B.CONCRETE + 8; }
          else if (y === P + 3 && l === 0) id = k % 8 === 4 ? B.GLASS_LAMP : B.CONCRETE + 8;
          else if (y === P - 1 && l === 0) id = dv[0] ? B.RAIL_EW : B.RAIL;
          set(cx, y, cz, id);
        }
      }
    };
    // first leg (and the whole tunnel when there is no bend)
    const leg1 = pl.bend ? pl.bend : Math.round(c0 - 14);
    for (let k = 1; k <= leg1; k++) tunnelCell(E[0] + e[0] * k, E[2] + e[1] * k, e, [-e[1], e[0]], k, k > 2);
    if (pl.bend) {
      // a chamber at the bend, then the second leg to the station
      const K = [E[0] + e[0] * pl.bend, E[2] + e[1] * pl.bend];
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let y = P - 3; y <= P + 5; y++) {
        const x = K[0] + a, z = K[1] + b, ring = Math.max(Math.abs(a), Math.abs(b)) === 3;
        let id = B.AIR;
        if (y <= P - 2) id = y === P - 2 && !ring ? B.GRAVEL : B.CONCRETE + 7;
        else if (ring || y === P + 5) id = y === P ? B.BLUE_TILES : B.CONCRETE + 8;
        else if (y === P + 4 && a === 0 && b === 0) id = B.GLASS_LAMP;
        set(x, y, z, id);
      }
      for (let k = 1; k <= Math.round(c0 - 14); k++) tunnelCell(K[0] + d[0] * k, K[1] + d[1] * k, d, [-d[1], d[0]], k, k > 3);
      // re-open where the legs meet the chamber
      for (const [v, len] of [[[-e[0], -e[1]], 3], [d, 3]]) for (let k = 1; k <= len; k++) for (let l = -1; l <= 1; l++) {
        const nv = [-v[1], v[0]], x = K[0] + v[0] * k + nv[0] * l, z = K[1] + v[1] * k + nv[1] * l;
        for (let y = P - 1; y <= P + 2; y++) set(x, y, z, y === P - 1 && l === 0 ? (v[0] ? B.RAIL_EW : B.RAIL) : B.AIR);
        set(x, P - 2, z, B.GRAVEL);
      }
      // the curved rail at the bend
      const din = mdirOf(-e[0], -e[1]), dout = mdirOf(d[0], d[1]);
      const ci = RAIL_LINKS.findIndex((q) => q.includes(din) && q.includes(dout));
      if (ci >= 0) set(K[0], P - 1, K[1], RAIL_IDS[ci]);
    }
    // the station: a = across (platform at negative a, track at 0), s = along d from its centre
    const O = pl.bend ? [E[0] + e[0] * pl.bend, E[2] + e[1] * pl.bend] : [E[0], E[2]];
    const X = (a, s) => O[0] + d[0] * (c0 + s) + m[0] * a, Z = (a, s) => O[1] + d[1] * (c0 + s) + m[1] * a;
    const S = (a, y, s, id, f) => set(X(a, s), y, Z(a, s), id, f);
    const stripe = METRO_STRIPES[(pl.index || 0) % METRO_STRIPES.length];
    for (let a = -9; a <= 2; a++) for (let s = -14; s <= 14; s++) {
      const mouth = s === -14 && a >= -1 && a <= 1;
      const wall = a === -9 || a === 2 || ((s === -14 || s === 14) && !mouth);
      for (let y = P - 3; y <= P + 6; y++) {
        let id = B.AIR;
        if (y === P + 6) id = B.CONCRETE;
        else if (y === P + 5) id = !wall && (a + s) % 4 === 0 ? B.GLASS_LAMP : B.CONCRETE + 8;
        else if (wall) id = y === P + 1 ? stripe : y < P - 1 ? B.CONCRETE + 7 : B.CONCRETE;
        else if (y === P - 1) id = a <= -2 ? (a === -2 ? B.CONCRETE + 4 : B.TERRAZZO) : a === 0 && s <= 12 ? (d[0] ? B.RAIL_EW : B.RAIL) : B.AIR;
        else if (y === P - 2) id = a >= -1 ? (a === 0 && s >= -13 && s <= 12 ? B.METRO_MARK : B.GRAVEL) : B.CONCRETE + 7;
        else if (y < P - 2) id = B.CONCRETE + 7;
        S(a, y, s, id);
      }
    }
    for (let a = -1; a <= 1; a++) { S(a, P - 1, 13, B.CONCRETE + 15); S(a, P, 13, B.CONCRETE + 14); }
    for (const s of [-9, -2, 5]) for (let y = P; y <= P + 4; y++) S(-5, y, s, y === P + 1 ? stripe : B.QUARTZ_PILLAR);
    const toWall = mface(-m[0], -m[1]), fromWall = mface(m[0], m[1]), back = mface(-d[0], -d[1]);
    for (const s of [-7, -6, 10, 11]) S(-8, P, s, shapeId('oak', 'stairs'), toWall);
    S(-8, P, -12, B.VENDING_MACHINE, fromWall);
    S(-9, P + 1, -4, B.METRO_PANEL, fromWall);
    const pic = (a, y, s, f, w, h, name, alongS) => {
      // anchor: the bottom-left cell as seen by someone looking at it
      const nrm = f === 0 ? [1, 0] : f === 1 ? [-1, 0] : f === 4 ? [0, 1] : [0, -1], right = [nrm[1], -nrm[0]];
      let best = null, bv = Infinity;
      for (let i = 0; i < w; i++) { const x = X(alongS ? a : a + i, alongS ? s + i : s), z = Z(alongS ? a : a + i, alongS ? s + i : s), v = x * right[0] + z * right[1]; if (v < bv) { bv = v; best = [x, z]; } }
      pics.push({ id: 'm' + best[0] + ',' + y + ',' + best[1], x: best[0], y, z: best[1], f, w, h, builtin: name });
    };
    const sign = metroSign(pl.name);
    const trackSide = mface(-m[0], -m[1]);
    pic(1, P + 2, -11, trackSide, 3, 1, sign, true);
    pic(1, P + 2, 4, trackSide, 3, 1, sign, true);
    pic(-8, P + 1, 1, fromWall, 2, 1, 'metro_map', true);
    // the stair up to the street, 3 wide at a -13..-11, top at s = 7 - steps, landing s 7..9
    const n = pl.steps, st = shapeId('terrazzo', 'stairs'), sTop = 7 - n;
    for (let k = 0; k < n; k++) {
      const s = sTop + k, y = F - 1 - k, open = k <= 4, clear = open ? F + 3 : y + 4;
      for (let a = -13; a <= -11; a++) {
        S(a, y, s, st, back);
        S(a, y - 1, s, B.TERRAZZO);
        for (let yy = y + 1; yy <= clear; yy++) S(a, yy, s, B.AIR);
        if (!open && clear + 1 < F - 1) S(a, clear + 1, s, a === -12 && k % 3 === 0 ? B.GLASS_LAMP : B.CONCRETE + 8);
      }
      for (const a of [-14, -10]) for (let yy = y - 1; yy <= Math.min(clear + 1, F - 2); yy++) S(a, yy, s, yy === y + 2 ? stripe : B.CONCRETE);
    }
    for (let j = 7; j <= 9; j++) for (let a = -14; a <= -9; a++) for (let y = P - 2; y <= P + 4; y++) {
      let id = B.AIR;
      if (y === P - 2) id = B.CONCRETE + 7;
      else if (y === P - 1) id = B.TERRAZZO;
      else if (y === P + 4) id = a === -12 && j === 8 ? B.GLASS_LAMP : B.CONCRETE + 8;
      else if (a === -14) id = y === P + 1 ? stripe : B.CONCRETE;
      else if (a >= -10 && y > P + 2) id = B.CONCRETE;
      S(a, y, j, id);
    }
    for (let a = -14; a <= -9; a++) for (let y = P - 1; y <= P + 4; y++) S(a, y, 10, y === P + 1 ? stripe : B.CONCRETE);
    // the street: a paved square round the opening, railings, the glass canopy and the M
    for (let a = -17; a <= -7; a++) for (let s = sTop - 3; s <= sTop + 7; s++) {
      const hole = a >= -13 && a <= -11 && s >= sTop && s <= sTop + 4;
      if (hole) continue;
      const x = X(a, s), z = Z(a, s), h = MetroNet.surface(x, z).h;
      for (let y = Math.min(h, F - 3); y < F - 1; y++) set(x, y, z, B.STONE_BRICKS);
      S(a, F - 1, s, (a + s) % 4 === 0 ? B.POLISHED_ANDESITE : B.PANOT);
      for (let y = F; y <= Math.max(F + 5, h + 2); y++) S(a, y, s, B.AIR);
    }
    const vIn = sTop - 1, vBack = sTop + 5;
    for (let s = sTop; s <= vBack; s++) for (const a of [-14, -10]) S(a, F, s, B.IRON_BARS);
    for (let a = -13; a <= -11; a++) S(a, F, vBack, B.IRON_BARS);
    for (let a = -14; a <= -10; a++) for (let s = vIn; s <= sTop + 3; s++) S(a, F + 3, s, s === vIn ? B.CONCRETE + 14 : B.GLASS);
    for (const a of [-14, -10]) for (let y = F; y <= F + 2; y++) { S(a, y, vIn, B.BLACKSTONE_WALL); if (y > F) S(a, y, sTop + 3, B.BLACKSTONE_WALL); }
    for (let y = F; y <= F + 3; y++) S(-16, y, vIn, B.BLACKSTONE_WALL);
    S(-16, F + 4, vIn, B.CONCRETE + 14);
    pic(-13, F + 3, vIn - 1, back, 3, 1, sign, false);
    pic(-16, F + 4, vIn - 1, back, 1, 1, 'metro', false);
    return { list: [...out.values()], pics };
  },

  // Start building a plan (mine: this player pays and shares it).
  start(x, z, mine) {
    const pl = MetroPlan.make(x, z);
    if (pl.reason) { if (mine) G.ui.toast('🚇 ' + pl.reason, 4000); return false; }
    const N = MetroNet.get();
    const i = pl.end > 0 ? N.path.length - 1 : 0, E = N.path[i], P2 = N.path[i - pl.end];
    const e = [E[0] - P2[0], E[2] - P2[2]];
    pl.index = N.stations.length;
    if (mine) {
      if (G.mode === 'survival') {
        if ((G.money | 0) < pl.cost) { G.ui.toast('🚇 The works cost ' + pl.cost + ' coins (you have ' + (G.money | 0) + ')', 4000); return false; }
        G.money -= pl.cost;
        if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh();
      }
      if (Net.on) Net.op(['M', Math.round(x), Math.round(z)]);
    }
    const { list, pics } = this.blocks(pl, E, e);
    // from the line outwards, so the works advance through the tunnel
    list.sort((p, q) => Math.hypot(p[0] - E[0], p[2] - E[2]) - Math.hypot(q[0] - E[0], q[2] - E[2]));
    this.jobs.push({ list, pics, i: 0, mine, name: pl.name, at: [pl.x, pl.z], total: list.length });
    if (mine) {
      G.ui.toast('🚧 Works started: ' + pl.name + ' station', 4000);
      sfx('piston', G.player.pos, 1, 0.7);
    }
    return true;
  },

  update(dt) {
    const j = this.jobs[0];
    if (!j || !G.world) return;
    const w = G.world, was = Net.capture, cloud = Net.cloudOnly;
    Net.capture = false; Net.cloudOnly = j.mine;
    try {
      const batch = [];
      const end = Math.min(j.list.length, j.i + 900);
      for (; j.i < end; j.i++) {
        const [x, y, z, id, f] = j.list[j.i];
        if (w.isLoaded(x, z)) batch.push([x, y, z, id, f]);
        else Net.applyEdit(x, y, z, id, f), (Net.on && Net.server && j.mine && Cloud.push(x, y, z, id, f === undefined ? -1 : f, nowSec()));
      }
      if (batch.length) editBlocks(batch);
    } finally { Net.capture = was; Net.cloudOnly = cloud; }
    if (j.i >= j.list.length) {
      this.jobs.shift();
      for (const p of j.pics) if (!w.pictures.has(p.id)) Pictures.add(p, !j.mine);
      w.editsDirty = true;
      MetroNet.dirty = true;
      if (Metro.train && G.vehicle !== Metro.train) { Metro.train.removed = true; Metro.train = null; }
      if (j.mine) { G.ui.banner(j.icon || '🚇', j.done || j.name + ' station is open'); sfx('metro_chime', null, 1, 1); saveWorld(); }
    }
  },
};

// ---------------------------------------------------------------- the control panel ----
const MetroPanel = {
  el: null, open: false, picking: false,

  show() {
    const N = MetroNet.get();
    if (!N) { G.ui.toast('This panel is not connected to any line'); return; }
    this.open = true;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'metroPanel';
      this.el.className = 'overlay';
      document.body.append(this.el);
      this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    }
    this.render();
    this.el.classList.remove('hidden');
    sfx('click', null, 1, 1.2);
  },
  close() {
    if (!this.open) return;
    this.open = false;
    G.screenOpen = false;
    this.el.classList.add('hidden');
    requestLock();
  },

  render() {
    const N = MetroNet.get(), el = this.el;
    const len = N.path.length, p = G.player.pos;
    let here = -1, hd = Infinity;
    N.stations.forEach((s, i) => { const c = N.path[s.hp]; const d = Math.hypot(c[0] - p[0], c[2] - p[2]); if (d < hd) { hd = d; here = i; } });
    const t = Metro.train, ti = t && t.rail ? N.idx.get(posKey(t.rail.x, t.rail.y, t.rail.z)) : undefined;
    const pos = (i) => (len > 1 ? 4 + (i / (len - 1)) * 92 : 50);
    const minutes = Math.max(1, Math.round((len / 14 + N.stations.length * METRO_STOP.dwell) / 60));
    const job = MetroBuild.jobs[0];
    el.innerHTML = `
      <div class="mp-card">
        <div class="mp-head"><i>M</i><div><b>Línia 1 · STUCOM</b><span>Metro control panel</span></div><button class="mp-x" data-a="close">✕</button></div>
        <div class="mp-line"><div class="mp-track"></div>
          ${N.stations.map((s, i) => `<div class="mp-st${i === here ? ' here' : ''}" style="left:${pos((s.i0 + s.i1) / 2)}%"><em></em><span>${s.name}</span>${i === here ? '<small>You are here</small>' : ''}</div>`).join('')}
          ${ti !== undefined ? `<div class="mp-train" style="left:${pos(ti)}%">🚇</div>` : ''}
        </div>
        <div class="mp-stats">
          <div><b>${N.stations.length}</b><span>stations</span></div>
          <div><b>${(len / 1000).toFixed(2)} km</b><span>of track</span></div>
          <div><b>~${minutes} min</b><span>end to end</span></div>
          <div><b>${t ? (t.auto.state === 'run' ? 'Running' : 'At ' + (N.stations[t.auto.target] || {}).name) : 'Waiting'}</b><span>train</span></div>
        </div>
        ${job ? `<div class="mp-works">🚧 Building ${job.name}… ${Math.round(job.i / job.total * 100)}%</div>` : ''}
        <div class="mp-actions">
          <button class="primary" data-a="add">➕ Add a station…</button>
          <span>Pick the spot on the map: the line grows from its nearest end, with a tunnel, the platform and a stair up to the street.${G.mode === 'survival' ? ' The works are paid from your coins.' : ''}</span>
        </div>
      </div>`;
    el.querySelector('[data-a="close"]').addEventListener('click', () => this.close());
    el.querySelector('[data-a="add"]').addEventListener('click', () => this.pick());
  },

  // choose the spot on the world map
  pick() {
    this.open = false;
    this.el.classList.add('hidden');
    G.screenOpen = false;
    this.picking = true;
    WorldMap.show();
    const N = MetroNet.get(), c = N.path[N.path.length - 1];
    WorldMap.cx = c[0]; WorldMap.cz = c[2]; WorldMap.k = 0.8; WorldMap.draw();
    G.ui.toast('🚇 Click on the map where you want the new station', 4000);
  },
};

// ---------------------------------------------------------------- hooks ----
{
  // right-click a panel to open it
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.block && t.block.id === B.METRO_PANEL && !G.player.sneaking) { MetroPanel.show(); this.swingHand(); return true; }
    return use.call(this, initial);
  };
  // the map: the line and its stations, and building from the picked spot
  const panel0 = WorldMap.panel;
  WorldMap.panel = function () {
    panel0.call(this);
    if (!MetroPanel.picking) return;
    const box = $('wmSel'), s = this.sel;
    const info = document.createElement('div');
    info.className = 'wm-info metro';
    box.prepend(info);
    if (!s || s.marker) { info.textContent = '🚇 Click where the new station should come up to the street.'; return; }
    const pl = MetroPlan.make(s.x, s.z);
    if (pl.reason) { info.innerHTML = '🚇 <b>Not here:</b> '; info.append(document.createTextNode(pl.reason)); return; }
    info.innerHTML = '🚇 <b></b><br>';
    info.querySelector('b').textContent = 'New station: ' + pl.name;
    info.append(document.createTextNode((pl.bend ? 'Tunnel with a bend' : 'Straight tunnel') + ' · ' + pl.cells + ' m · ' + pl.steps + ' steps up to the street' + (G.mode === 'survival' ? ' · ' + pl.cost + ' coins' : '')));
    const b = document.createElement('button');
    b.className = 'primary';
    b.textContent = '🚧 Build ' + pl.name;
    b.addEventListener('click', () => { MetroPanel.picking = false; if (MetroBuild.start(s.x, s.z, true)) this.close(); else this.panel(); });
    box.append(b);
  };
  const close0 = WorldMap.close;
  WorldMap.close = function () { MetroPanel.picking = false; return close0.call(this); };
  const draw0 = WorldMap.draw;
  WorldMap.draw = function () {
    draw0.call(this);
    const N = MetroNet.cache;
    if (!N || !this.ctx) return;
    const ctx = this.ctx, cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const sx = (x) => (x - this.cx) * this.k * dpr + cv.width / 2, sy = (z) => (z - this.cz) * this.k * dpr + cv.height / 2;
    ctx.save();
    ctx.lineWidth = Math.max(2, 3 * dpr); ctx.strokeStyle = '#d6202b'; ctx.lineJoin = 'round';
    ctx.beginPath();
    N.path.forEach((c, i) => { if (i === 0) ctx.moveTo(sx(c[0] + 0.5), sy(c[2] + 0.5)); else if (i % 3 === 0 || i === N.path.length - 1) ctx.lineTo(sx(c[0] + 0.5), sy(c[2] + 0.5)); });
    ctx.stroke();
    ctx.font = '700 ' + Math.round(11 * dpr) + 'px system-ui, sans-serif';
    for (const s of N.stations) {
      const c = N.path[Math.round((s.i0 + s.i1) / 2)];
      const x = sx(c[0] + 0.5), y = sy(c[2] + 0.5);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d6202b'; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const tw = ctx.measureText(s.name).width;
      ctx.fillRect(x + 8 * dpr, y - 8 * dpr, tw + 8 * dpr, 16 * dpr);
      ctx.fillStyle = '#fff'; ctx.fillText(s.name, x + 12 * dpr, y + 4 * dpr);
    }
    ctx.restore();
  };
  // other players' works
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'M') { const x = Number(o[2]), z = Number(o[3]); if (Number.isFinite(x) && Number.isFinite(z)) MetroBuild.start(x, z, false); return; }
    return ap.call(this, r, o);
  };
  // closing the panel with Escape
  window.addEventListener('keydown', (e) => { if (MetroPanel.open && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); MetroPanel.close(); } }, true);
}

// ---------------------------------------------------------------- textures and recipes ----
gen('metro_panel_front', (d, rng, ctx) => fillTile(d, (x, y, k) => {
  const bezel = x < 3 || x > 28 || y < 3 || y > 28;
  if (bezel) { put(d, x, y, [52, 56, 64], (x === 0 || y === 0 ? 1.2 : 1) * (0.92 + rng() * 0.08)); return; }
  // a dark screen with the red line, white stations and a green train
  let c = [18, 26, 44], e = 0.35;
  if (y >= 14 && y <= 16 && x >= 6 && x <= 25) { c = [214, 40, 50]; e = 0.9; }
  if ((x === 7 || x === 13 || x === 19 || x === 24) && y >= 13 && y <= 17) { c = [240, 240, 240]; e = 1; }
  if (y >= 9 && y <= 10 && x >= 15 && x <= 18) { c = [90, 230, 120]; e = 1; }
  if (y === 6 && x >= 6 && x <= 12) { c = [214, 40, 50]; e = 0.9; }
  if (y >= 21 && y <= 23 && x >= 6 && x <= 25 && (x % 3)) { c = [120, 150, 190]; e = 0.6; }
  put(d, x, y, c, 0.9 + rng() * 0.1);
  ctx.emit[k] = e;
}), { smooth: 0.8, bump: 0.3 });
gen('metro_panel_side', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [70, 74, 82], (y % 8 === 0 ? 1.15 : 1) * (0.9 + rng() * 0.1))), { smooth: 0.6, bump: 0.6 });
gen('metro_mark', (d, rng, ctx) => {
  TEX_GEN.gravel(d, rng, ctx);
  fillTile(d, (x, y) => { if (x >= 12 && x <= 19) put(d, x, y, [236, 196, 40], 0.85 + rng() * 0.15); });
}, { smooth: 0.2, bump: 1.2 });
shaped(B.METRO_PANEL, 1, ['III', 'IGI', 'IWI'], { I: I.IRON_INGOT, G: B.GLASS, W: B.WIRE });
shaped(B.METRO_MARK, 4, ['GYG'], { G: B.GRAVEL, Y: B.CONCRETE + 4 });
