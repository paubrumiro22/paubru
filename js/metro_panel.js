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

// Names that were used before the lines got their own (kept so old station signs still draw)
const METRO_LEGACY = ['Urquinaona', 'Arc de Triomf', 'Marina', 'Glòries', 'Clot', 'Navas', 'La Sagrera', 'Fabra i Puig', 'Sant Andreu',
  'Torras i Bages', 'Trinitat Vella', 'Baró de Viver', 'Santa Coloma', 'Fondo', 'Urgell', 'Rocafort', 'Espanya', 'Hostafrancs', 'Plaça de Sants',
  'Mercat Nou', 'Santa Eulàlia', 'Torrassa', 'Florida', 'Can Serra', 'Rambla Just Oliveras', 'Bellvitge'];
// Made-up names with a Barcelona feel, for stations nobody named
const METRO_NAMES = ['Plaça del Rellotge', 'Rambla del Mar', 'Passeig dels Pins', 'Can Blocs', 'Turó del Vent', 'Font Vella', 'Mercat del Sol',
  'Sant Pau Nou', 'Parc de les Aus', 'Moll de la Llum', 'Els Horts', 'La Farga', 'Poble Alt', 'Torre Blava', 'Pedralta', 'Riera Fosca',
  'Vallnova', 'Les Arcades', 'Camí Ral', 'Serra Clara', 'Cala Tranquil·la', 'Plaça dels Cubs', 'Jardins del Nord', 'Pont de Fusta',
  'Can Pixel', 'Bosc Daurat', 'Les Voltes', 'Mirador', 'Sagrada Pedra', 'Barri de Vidre'];
// Line colours (hex for the maps, concrete for the station stripe)
const METRO_LINES = [
  { n: 1, color: '#d6202b', stripe: B.CONCRETE + 14 }, { n: 2, color: '#8e3fb3', stripe: B.CONCRETE + 10 }, { n: 3, color: '#2e9a48', stripe: B.CONCRETE + 13 },
  { n: 4, color: '#f2b300', stripe: B.CONCRETE + 4 }, { n: 5, color: '#1f6fd1', stripe: B.CONCRETE + 11 }, { n: 6, color: '#e8732a', stripe: B.CONCRETE + 1 },
  { n: 7, color: '#2bb3c0', stripe: B.CONCRETE + 9 }, { n: 8, color: '#e25b9c', stripe: B.CONCRETE + 6 },
];
const lineInfo = (n) => METRO_LINES[(n - 1) % METRO_LINES.length];
const METRO_STRIPES = [B.BLUE_TILES, B.CONCRETE + 14, B.CONCRETE + 4, B.CONCRETE + 5, B.CONCRETE + 1, B.CONCRETE + 10, B.CONCRETE + 9, B.CONCRETE + 6];
const MDIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // rail link directions (as RIDE_DIRV)
const mdirOf = (dx, dz) => (dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3);
const mface = (dx, dz) => (dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 4 : 5);   // block facing towards a direction
const TRANSFER_DIST = 90;   // stations of different lines this close are an interchange

// Station name signs: 'metro_st_<name>' (line 1, old saves) or 'metro_st_<line>~<name>'
function metroStSign(key) {
  const id = 'metro_st_' + key;
  if (PIC_BUILTIN[id]) return id;
  const t = key.indexOf('~'), n = t > 0 ? Number(key.slice(0, t)) || 1 : 1, name = t > 0 ? key.slice(t + 1) : key;
  const L = lineInfo(n);
  PIC_BUILTIN[id] = { w: 3, h: 1, draw(g, W, H) {
    g.fillStyle = '#16213a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d6202b'; g.fillRect(18, 22, H - 44, H - 44);
    g.fillStyle = '#fff'; g.font = '900 96px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('M', 18 + (H - 44) / 2, H / 2 + 34);
    // the line: a coloured pill with its number
    const px = H + 4;
    g.fillStyle = L.color; g.beginPath(); g.arc(px + 34, H / 2, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '800 40px Arial, sans-serif'; g.fillText('L' + n, px + 34, H / 2 + 14);
    g.textAlign = 'left'; g.font = '700 ' + (name.length > 16 ? 38 : name.length > 11 ? 46 : 58) + 'px Arial, sans-serif'; g.fillText(name, px + 80, H / 2 + 18);
  } };
  return id;
}
for (const n of METRO_LEGACY) metroStSign(n);
const metroSign = (name, n = 1) => (n === 1 && name === 'Universitat' ? 'metro_name' : n === 1 && name === 'Catalunya' ? 'metro_name2' : metroStSign(n + '~' + name));
{
  // signs of stations named by players are made when a saved or shared picture needs them
  const vp = validPicture;
  // eslint-disable-next-line no-global-assign
  validPicture = function (p) {
    if (p && typeof p.builtin === 'string' && p.builtin.startsWith('metro_st_') && p.builtin.length < 60) metroStSign(p.builtin.slice(9));
    return vp(p);
  };
}

// the lines players built and the station names they chose (saved with the world, extras.metro)
function metroRec() { const w = G.world; return w.metro || (w.metro = { lines: [], names: [] }); }

const MetroNet = {
  cache: null, key: null, dirty: true, t: 0, gen: new Map(),

  // every line: [{ n, color, path, idx, stations }], line 1 first (the STUCOM one) when it exists
  all() {
    const w = G.world;
    if (!w || !w.gen || !w.gen.structs) return [];
    const key = w.seed + ':' + w.genVer;
    const now = performance.now();
    if (this.key !== key) { this.key = key; this.cache = null; this.gen.clear(); this.dirty = true; }
    if (this.dirty || now - this.t > 20000) {
      this.dirty = false; this.t = now;
      try { this.cache = this.traceAll(); } catch (e) { console.warn('Blocklands: metro trace', e); this.cache = []; }
    }
    return this.cache || [];
  },
  // one line (n), or the one nearest to the player
  get(n) {
    const all = this.all();
    if (!all.length) return null;
    if (n) return all.find((l) => l.n === n) || null;
    return this.current(G.player.pos) || all[0];
  },
  current(p) {
    let best = null, bd = Infinity;
    for (const N of this.all()) {
      for (let i = 0; i < N.path.length; i += 6) {
        const c = N.path[i];
        const d = Math.abs(c[0] - p[0]) + Math.abs(c[2] - p[2]);
        if (d < bd && Math.abs(c[0] - p[0]) < 110 && Math.abs(c[2] - p[2]) < 110 && Math.abs(c[1] - p[1]) < 60) { bd = d; best = N; }
      }
    }
    return best;
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

  // the whole track through a rail cell, both ways
  walkFrom(s0) {
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
    return walk(s0, l0[0]).reverse().concat([s0], walk(s0, l0[1]));
  },
  // platforms: runs of marked track
  platforms(path, extra) {
    const stations = [];
    let run = null;
    path.forEach((c, i) => {
      const m = this.block(c[0], c[1] - 1, c[2]) === B.METRO_MARK;
      if (m && !run) run = { i0: i, i1: i };
      else if (m) run.i1 = i;
      if ((!m || i === path.length - 1) && run) { stations.push(run); run = null; }
    });
    for (const i of extra || []) if (!stations.some((q) => i >= q.i0 - 2 && i <= q.i1 + 2)) stations.push({ i0: i, i1: i });
    stations.sort((a, b) => a.i0 - b.i0);
    for (const s of stations) { s.hp = Math.max(s.i0, s.i1 - 5); s.hm = Math.min(s.i1, s.i0 + 5); }
    return stations;
  },
  nearIdx(path, at) { let bi = 0, bd = Infinity; path.forEach((c, i) => { const d = Math.abs(c[0] - at[0]) + Math.abs(c[2] - at[2]) + Math.abs(c[1] - at[1]); if (d < bd) { bd = d; bi = i; } }); return bi; },

  traceAll() {
    const nets = [];
    const L = this.line();
    const cell = (at) => [Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2])];
    if (L) {
      let path = this.walkFrom(cell(L.stops[0].at));
      if (path) {
        if (this.nearIdx(path, L.stops[1].at) < this.nearIdx(path, L.stops[0].at)) path = path.reverse();
        const stations = this.platforms(path, L.stops.map((s) => this.nearIdx(path, s.at)));
        const iu = this.nearIdx(path, L.stops[0].at);
        let u = stations.findIndex((s) => iu >= s.i0 - 2 && iu <= s.i1 + 2);
        if (u < 0) u = 0;
        stations.forEach((s, i) => { if (i === u) s.fixed = 'Universitat'; else if (i === u + 1) s.fixed = 'Catalunya'; });
        nets.push({ n: 1, path, stations, line: L });
      }
    }
    for (const rec of metroRec().lines) {
      if (nets.some((q) => q.n === rec.n)) continue;
      const path = this.walkFrom(rec.c);
      if (!path || path.length < 3) continue;
      nets.push({ n: rec.n, path, stations: this.platforms(path, [this.nearIdx(path, rec.c)]) });
    }
    // names: the ones players gave, the two STUCOM originals, or a made-up one from the place
    const names = metroRec().names, used = new Set();
    for (const N of nets) {
      N.color = lineInfo(N.n).color;
      N.idx = new Map();
      N.path.forEach((c, i) => N.idx.set(posKey(c[0], c[1], c[2]), i));
      for (const s of N.stations) {
        s.c = N.path[Math.round((s.i0 + s.i1) / 2)];
        const q = names.find((e) => Math.abs(e.x - s.c[0]) < 26 && Math.abs(e.z - s.c[2]) < 26);
        s.name = q ? q.name : s.fixed || this.themed(s.c[0], s.c[2], used);
        used.add(s.name);
      }
    }
    // interchanges
    for (const N of nets) for (const s of N.stations) {
      s.transfer = [];
      for (const M of nets) if (M !== N && M.stations.some((t) => Math.hypot(t.c[0] - s.c[0], t.c[2] - s.c[2]) < TRANSFER_DIST)) s.transfer.push(M.n);
    }
    return nets;
  },
  themed(x, z, used) {
    let h = Math.floor(hash3(Math.floor(x / 8), 0, Math.floor(z / 8), 313) * METRO_NAMES.length);
    for (let k = 0; k < METRO_NAMES.length; k++) { const n = METRO_NAMES[(h + k) % METRO_NAMES.length]; if (!used || !used.has(n)) return n; }
    return METRO_NAMES[h];
  },

  near(p) { return !!this.current(p); },

  // a name for a new station at (x, z) nobody named
  suggest(x, z) {
    const used = new Set();
    for (const N of this.all()) for (const s of N.stations) used.add(s.name);
    return this.themed(x, z, used);
  },
  nextLine() { let n = 2; for (const N of this.all()) n = Math.max(n, N.n + 1); for (const r of metroRec().lines) n = Math.max(n, r.n + 1); return n; },
};

// ---------------------------------------------------------------- planning a new station ----
// For a spot (x, z): extend from whichever end of the line can reach it, straight on or with one
// bend, and put the station so that its stair comes up there. Returns a plan or { reason }.
const MetroPlan = {
  make(x, z, n) {
    const N = MetroNet.get(n || 1);
    if (!N || N.path.length < 3) return { reason: 'There is no metro line in this world yet: start one.' };
    if (dimOf(x, z) !== DIM_OVER) return { reason: 'The metro only runs in the Overworld.' };
    const tries = [];
    for (const end of [-1, 1]) {
      const i = end > 0 ? N.path.length - 1 : 0, E = N.path[i], P2 = N.path[i - end];
      const e = [E[0] - P2[0], E[2] - P2[2]];
      if (Math.abs(e[0]) + Math.abs(e[1]) !== 1) continue;
      const nv = [-e[1], e[0]];
      const t = (x - E[0]) * e[0] + (z - E[2]) * e[1], l = (x - E[0]) * nv[0] + (z - E[2]) * nv[1];
      const r = this.route(E, e, nv, t, l, end);
      if (r.reason) tries.push(r); else tries.push(Object.assign(r, { end, E, e }));
    }
    let ok = tries.filter((r) => !r.reason).sort((a, b) => a.cells - b.cells);
    const clear = ok.filter((r) => !this.clashes(r, N.n));
    if (ok.length && !clear.length) return { reason: 'Another line’s tunnel is in the way. Pick another spot.', score: 5 };
    ok = clear;
    if (ok.length) return this.finish(ok[0], x, z, N.n);
    return tries.sort((a, b) => (b.score || 0) - (a.score || 0))[0] || { reason: 'The line cannot reach there.' };
  },

  // A new line: its first station comes up right at (x, z), running east-west or north-south
  // (whichever keeps the stair clear of other lines); later stations extend it like any line.
  newLine(x, z) {
    if (dimOf(x, z) !== DIM_OVER) return { reason: 'The metro only runs in the Overworld.' };
    const sf = MetroNet.surface(Math.floor(x), Math.floor(z));
    if (sf.water || sf.h < SEA) return { reason: 'The street there is under water.', score: 3 };
    let best = null;
    // a little deeper or shallower if another line is in the way
    for (const dp of [0, -7, 5]) {
      const P = sf.h + 1 - 14 + dp;
      if (P < 8) continue;
      for (const [d, m] of [[[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]], [[0, -1], [1, 0]]]) {
        const along = 24;
        const O = [Math.round(x) - d[0] * along + m[0] * 12, Math.round(z) - d[1] * along + m[1] * 12];
        const r = this.station([O[0], P - 1, O[1]], d, m, P, along, 0);
        if (r.reason) { if (!best) best = r; continue; }
        Object.assign(r, { E: [O[0], P - 1, O[1]], e: d, end: 1 });
        if (this.clashes(r, 0)) { if (!best || best.reason) best = { reason: 'Another line’s tunnel is in the way. Pick a spot a little further from it.', score: 2 }; continue; }
        if (!best || best.reason || r.cells < best.cells) best = r;
      }
      if (best && !best.reason) break;
    }
    if (!best || best.reason) return best || { reason: 'No room for a station there.' };
    best.newLine = MetroNet.nextLine();
    return this.finish(best, x, z, best.newLine);
  },

  // would the works of a plan cut through another line's tunnel?
  clashes(pl, n) {
    const near = new Set();
    for (const N of MetroNet.all()) {
      if (N.n === n) continue;
      for (const c of N.path) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) near.add((c[0] + dx) + ',' + (c[2] + dz) + ',' + (c[1] >> 2));
    }
    if (!near.size) return false;
    const { list } = MetroBuild.blocks(pl, pl.E, pl.e);
    for (const [x, y, z] of list) for (const dy of [-1, 0, 1, 2]) if (near.has(x + ',' + z + ',' + ((y >> 2) + dy))) return true;
    return false;
  },

  finish(pl, x, z, n) {
    pl.x = Math.round(x); pl.z = Math.round(z); pl.line = n;
    const O = pl.bend ? [pl.E[0] + pl.e[0] * pl.bend, pl.E[2] + pl.e[1] * pl.bend] : [pl.E[0], pl.E[2]];
    pl.center = [O[0] + pl.d[0] * pl.c0, O[1] + pl.d[1] * pl.c0];
    pl.name = MetroNet.suggest(pl.center[0], pl.center[1]);
    // an interchange when another line has a station close by
    pl.transfer = [];
    for (const N of MetroNet.all()) if (N.n !== n && N.stations.some((s) => Math.hypot(s.c[0] - pl.center[0], s.c[2] - pl.center[1]) < TRANSFER_DIST)) pl.transfer.push(N.n);
    return pl;
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
    const stripe = pl.stripe || METRO_STRIPES[(pl.index || 0) % METRO_STRIPES.length];
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
    const sign = metroSign(pl.name, pl.line || 1);
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
    // fare gates between the stair landing and the platform (a metro card opens them), and the
    // ticket machine that sells the cards
    for (let j = 7; j <= 9; j++) S(-10, P, j, B.TURNSTILE, fromWall);
    S(-13, P, 9, B.TICKET_MACHINE, back);
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

  // Start building a station (mine: this player pays and shares it). opt: { line, name, newLine }
  start(x, z, mine, opt = {}) {
    const pl = opt.newLine ? MetroPlan.newLine(x, z) : MetroPlan.make(x, z, opt.line || 1);
    if (pl.reason) { if (mine) G.ui.toast('🚇 ' + pl.reason, 4000); return false; }
    if (opt.newLine && opt.newLine !== pl.newLine) { pl.newLine = opt.newLine; pl.line = opt.newLine; }
    const name = (typeof opt.name === 'string' && opt.name.trim().slice(0, 28)) || pl.name;
    pl.name = name;
    const E = pl.E, e = pl.e;
    const N = MetroNet.get(pl.line);
    pl.index = N ? N.stations.length : 0;
    pl.stripe = lineInfo(pl.line).stripe;
    if (mine) {
      if (G.mode === 'survival') {
        if ((G.money | 0) < pl.cost) { G.ui.toast('🚇 The works cost ' + pl.cost + ' coins (you have ' + (G.money | 0) + ')', 4000); return false; }
        G.money -= pl.cost;
        if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh();
      }
      if (Net.on) Net.op(['M', Math.round(x), Math.round(z), pl.line, name, opt.newLine ? 1 : 0]);
    }
    // remember the line and the name (every player records the same)
    const R = metroRec();
    R.names = R.names.filter((q) => Math.abs(q.x - pl.center[0]) >= 26 || Math.abs(q.z - pl.center[1]) >= 26);
    R.names.push({ x: pl.center[0], z: pl.center[1], name });
    if (pl.newLine && !R.lines.some((l) => l.n === pl.newLine)) R.lines.push({ n: pl.newLine, c: [pl.center[0], pl.P - 1, pl.center[1]] });
    const { list, pics } = this.blocks(pl, E, e);
    // from the line outwards, so the works advance through the tunnel
    list.sort((p, q) => Math.hypot(p[0] - E[0], p[2] - E[2]) - Math.hypot(q[0] - E[0], q[2] - E[2]));
    this.jobs.push({ list, pics, i: 0, mine, name, at: [pl.x, pl.z], total: list.length, line: pl.line });
    if (mine) {
      G.ui.toast('🚧 Works started: ' + name + ' (L' + pl.line + ')', 4000);
      sfx('piston', G.player.pos, 1, 0.7);
    }
    MetroNet.dirty = true;
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
  el: null, open: false, picking: null, line: 0, name: '',

  show() {
    const N = MetroNet.get();
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
    this.line = N ? N.n : 0;
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

  pill(n) { const L = lineInfo(n); return `<i class="mp-l" style="background:${L.color}">L${n}</i>`; },

  render() {
    const all = MetroNet.all(), el = this.el;
    const N = all.find((q) => q.n === this.line) || all[0];
    const job = MetroBuild.jobs[0];
    const tabs = all.map((q) => `<button class="mp-tab${q === N ? ' on' : ''}" data-l="${q.n}" style="--lc:${q.color}">L${q.n}<small>${q.stations.length}</small></button>`).join('');
    let body = '';
    if (N) {
      const len = N.path.length, p = G.player.pos;
      let here = -1, hd = 160;
      N.stations.forEach((s, i) => { const d = Math.hypot(s.c[0] - p[0], s.c[2] - p[2]); if (d < hd) { hd = d; here = i; } });
      const t = Metro.train, ti = t && t.auto && t.auto.line === N.n && t.rail ? N.idx.get(posKey(t.rail.x, t.rail.y, t.rail.z)) : undefined;
      const pos = (i) => (len > 1 ? 4 + (i / (len - 1)) * 92 : 50);
      const minutes = Math.max(1, Math.round((len / 14 + N.stations.length * METRO_STOP.dwell) / 60));
      body = `
        <div class="mp-line" style="--lc:${N.color}"><div class="mp-track"></div>
          ${N.stations.map((s, i) => `<div class="mp-st${i === here ? ' here' : ''}${s.transfer.length ? ' xfer' : ''}" style="left:${pos((s.i0 + s.i1) / 2)}%"><em></em><span>${escapeHtml(s.name)}</span>${s.transfer.length ? `<small class="mp-x2">${s.transfer.map((n) => this.pill(n)).join('')}</small>` : i === here ? '<small>You are here</small>' : ''}</div>`).join('')}
          ${ti !== undefined ? `<div class="mp-train" style="left:${pos(ti)}%">🚇</div>` : ''}
        </div>
        <div class="mp-stats">
          <div><b>${N.stations.length}</b><span>stations</span></div>
          <div><b>${(len / 1000).toFixed(2)} km</b><span>of track</span></div>
          <div><b>~${minutes} min</b><span>end to end</span></div>
          <div><b>${N.stations.reduce((a, s) => a + (s.transfer.length ? 1 : 0), 0)}</b><span>interchanges</span></div>
        </div>`;
    } else body = '<p class="mp-empty">No metro yet in this world. Start the first line wherever you like — next to your house, for example.</p>';
    el.innerHTML = `
      <div class="mp-card">
        <div class="mp-head"><i>M</i><div><b>${N ? 'Línia ' + N.n + (N.n === 1 ? ' · STUCOM' : '') : 'Metro'}</b><span>Metro control panel</span></div><button class="mp-x" data-a="close">✕</button></div>
        ${all.length ? `<div class="mp-tabs">${tabs}</div>` : ''}
        ${body}
        ${job ? `<div class="mp-works">🚧 Building ${escapeHtml(job.name)}… ${Math.round(job.i / job.total * 100)}%</div>` : ''}
        <div class="mp-name"><label>Name of the next station</label><input id="mpName" type="text" maxlength="28" placeholder="Leave empty for a local name, e.g. “Can ${escapeHtml((Net.name || 'Pau').split(' ')[0])}”"></div>
        <div class="mp-actions">
          ${N ? `<button class="primary" data-a="add">➕ New station on L${N.n}…</button>` : ''}
          <button data-a="line">✨ Start a new line…</button>
          <button data-a="map">🗺 Network map</button>
        </div>
        <p class="mp-note">Pick the spot on the map — right by your house if you like: the line grows from its nearest end with a tunnel, a platform with fare gates and a stair up to the street. A new line starts with its first station there; stations of different lines close together become interchanges.${G.mode === 'survival' ? ' The works are paid from your coins.' : ''}</p>
      </div>`;
    const nm = el.querySelector('#mpName');
    nm.value = this.name;
    nm.addEventListener('input', () => { this.name = nm.value; });
    nm.addEventListener('keydown', (e) => e.stopPropagation());
    el.querySelector('[data-a="close"]').addEventListener('click', () => this.close());
    const add = el.querySelector('[data-a="add"]');
    if (add) add.addEventListener('click', () => this.pick({ line: N.n }));
    el.querySelector('[data-a="line"]').addEventListener('click', () => this.pick({ newLine: true }));
    el.querySelector('[data-a="map"]').addEventListener('click', () => MetroMap.show());
    for (const b of el.querySelectorAll('.mp-tab')) b.addEventListener('click', () => { this.line = Number(b.dataset.l); this.render(); });
  },

  // choose the spot on the world map
  pick(mode) {
    this.open = false;
    this.el.classList.add('hidden');
    G.screenOpen = false;
    this.picking = Object.assign({ name: this.name.trim() }, mode);
    WorldMap.show();
    const N = mode.line && MetroNet.get(mode.line);
    const c = N ? N.path[N.path.length - 1] : G.player.pos;
    WorldMap.cx = c[0]; WorldMap.cz = c[2]; WorldMap.k = 0.8; WorldMap.draw();
    G.ui.toast(mode.newLine ? '🚇 Click on the map where the new line starts' : '🚇 Click on the map where you want the new station', 4000);
  },
};

function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

// ---------------------------------------------------------------- the network map ----
// A diagram of every line with its stations and interchanges, in their real positions.
const MetroMap = {
  el: null,
  show() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'metroMap';
      this.el.className = 'overlay';
      this.el.innerHTML = '<div class="mm-card"><div class="mm-head"><i>M</i><b>Metro network</b><button data-a="x">✕</button></div><canvas></canvas><div class="mm-legend"></div></div>';
      document.body.append(this.el);
      this.el.addEventListener('click', (e) => { if (e.target === this.el || e.target.dataset.a === 'x') this.close(); });
    }
    if (!G.screenOpen) { G.screenOpen = true; releaseAllInput(); try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } this.own = true; }
    this.el.classList.remove('hidden');
    this.open = true;
    this.draw();
  },
  close() {
    this.el.classList.add('hidden');
    this.open = false;
    if (this.own) { this.own = false; G.screenOpen = false; if (!MetroPanel.open) requestLock(); }
  },
  draw() {
    const all = MetroNet.all(), cv = this.el.querySelector('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.min(900, window.innerWidth - 60), H = Math.min(560, window.innerHeight - 170);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H);
    // light grid like a printed map
    g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (!all.length) { g.fillStyle = '#555'; g.font = '600 16px system-ui'; g.textAlign = 'center'; g.fillText('No lines yet', W / 2, H / 2); return; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const N of all) for (const c of N.path) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); }
    const p = G.player.pos;
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
    const pad = 70, k = Math.min((W - 2 * pad) / Math.max(40, x1 - x0), (H - 2 * pad) / Math.max(40, z1 - z0));
    const X = (x) => pad + (x - x0) * k + (W - 2 * pad - (x1 - x0) * k) / 2, Y = (z) => pad + (z - z0) * k + (H - 2 * pad - (z1 - z0) * k) / 2;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const N of all) {
      g.strokeStyle = N.color; g.lineWidth = 7;
      g.beginPath();
      N.path.forEach((c, i) => { if (i === 0) g.moveTo(X(c[0]), Y(c[2])); else if (i % 4 === 0 || i === N.path.length - 1) g.lineTo(X(c[0]), Y(c[2])); });
      g.stroke();
    }
    g.font = '700 12px system-ui, sans-serif';
    const drawn = [];
    for (const N of all) for (const s of N.stations) {
      const x = X(s.c[0]), y = Y(s.c[2]);
      if (s.transfer.length) { g.fillStyle = '#fff'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); g.stroke(); }
      else { g.fillStyle = '#fff'; g.strokeStyle = N.color; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
      if (drawn.some((q) => Math.abs(q[0] - x) < 60 && Math.abs(q[1] - y) < 14 && q[2] === s.name)) continue;
      drawn.push([x, y, s.name]);
      g.fillStyle = '#1a1a1a'; g.textAlign = 'left';
      g.fillText(s.name, x + 11, y - 8);
    }
    // you are here
    const px = X(p[0]), py = Y(p[2]);
    g.fillStyle = '#e63946'; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(230,57,70,0.35)'; g.lineWidth = 6; g.beginPath(); g.arc(px, py, 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e63946'; g.font = '800 11px system-ui'; g.fillText('YOU', px + 10, py + 16);
    this.el.querySelector('.mm-legend').innerHTML = all.map((N) => `<span><i style="background:${N.color}">L${N.n}</i>${escapeHtml(N.stations[0] ? N.stations[0].name : '')} – ${escapeHtml(N.stations[N.stations.length - 1] ? N.stations[N.stations.length - 1].name : '')}</span>`).join('') + '<span><em></em>Interchange</span>';
  },
};

// ---------------------------------------------------------------- riding: the line strip ----
// Aboard a train: the line along the top of the screen, the next stop lit up.
const MetroStrip = {
  el: null, key: '',
  update() {
    const v = G.vehicle, a = v && v.auto;
    const show = !!(a && !G.hudHidden);
    if (!show) { if (this.el) this.el.classList.remove('show'); return; }
    const N = MetroNet.get(a.line);
    if (!N) return;
    if (!this.el) { this.el = document.createElement('div'); this.el.id = 'metroStrip'; $('hud').append(this.el); }
    const key = N.n + ':' + a.target + ':' + a.state + ':' + N.stations.length;
    if (key !== this.key) {
      this.key = key;
      const n = N.stations.length;
      this.el.style.setProperty('--lc', N.color);
      this.el.innerHTML = `<i class="mp-l" style="background:${N.color}">L${N.n}</i><div class="ms-line">${N.stations.map((s, i) => `<span class="${i === a.target ? (a.state === 'run' ? 'next' : 'at') : ''}${(a.dir > 0 ? i < a.target : i > a.target) ? ' past' : ''}" style="left:${n > 1 ? (i / (n - 1)) * 100 : 50}%"><em></em><b>${escapeHtml(s.name)}</b>${s.transfer.length ? `<small>${s.transfer.map((t) => 'L' + t).join(' ')}</small>` : ''}</span>`).join('')}</div>`;
    }
    this.el.classList.add('show');
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
  // the map: the lines and their stations, and building from the picked spot
  const panel0 = WorldMap.panel;
  WorldMap.panel = function () {
    panel0.call(this);
    const mode = MetroPanel.picking;
    if (!mode) return;
    const box = $('wmSel'), s = this.sel;
    const info = document.createElement('div');
    info.className = 'wm-info metro';
    box.prepend(info);
    if (!s || s.marker) { info.textContent = mode.newLine ? '🚇 Click where the new line’s first station should come up to the street.' : '🚇 Click where the new station should come up to the street.'; return; }
    const pl = mode.newLine ? MetroPlan.newLine(s.x, s.z) : MetroPlan.make(s.x, s.z, mode.line);
    if (pl.reason) { info.innerHTML = '🚇 <b>Not here:</b> '; info.append(document.createTextNode(pl.reason)); return; }
    const name = mode.name || pl.name;
    info.innerHTML = '🚇 <b></b><br>';
    info.querySelector('b').textContent = (mode.newLine ? 'New line L' + pl.line + ': ' : 'New station on L' + pl.line + ': ') + name;
    info.append(document.createTextNode((mode.newLine ? 'First station' : pl.bend ? 'Tunnel with a bend' : 'Straight tunnel') + ' · ' + pl.cells + ' m · ' + pl.steps + ' steps up to the street' +
      (pl.transfer.length ? ' · interchange with ' + pl.transfer.map((n) => 'L' + n).join(', ') : '') + (G.mode === 'survival' ? ' · ' + pl.cost + ' coins' : '')));
    // the name can still be changed here, right before building
    const nm = document.createElement('input');
    nm.type = 'text'; nm.maxLength = 28; nm.className = 'wm-name'; nm.value = name; nm.placeholder = 'Station name';
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') b.click(); });
    nm.addEventListener('input', () => { mode.name = nm.value.trim(); b.textContent = '🚧 Build ' + (mode.name || pl.name); info.querySelector('b').textContent = (mode.newLine ? 'New line L' + pl.line + ': ' : 'New station on L' + pl.line + ': ') + (mode.name || pl.name); });
    box.append(nm);
    const b = document.createElement('button');
    b.className = 'primary';
    b.textContent = '🚧 Build ' + name;
    b.addEventListener('click', () => {
      const final = nm.value.trim().slice(0, 28) || pl.name;
      MetroPanel.picking = null; MetroPanel.name = '';
      if (MetroBuild.start(s.x, s.z, true, { line: mode.line, newLine: mode.newLine ? pl.line : 0, name: final })) this.close(); else this.panel();
    });
    box.append(b);
  };
  const close0 = WorldMap.close;
  WorldMap.close = function () { MetroPanel.picking = null; return close0.call(this); };
  const draw0 = WorldMap.draw;
  WorldMap.draw = function () {
    draw0.call(this);
    const all = MetroNet.cache;
    if (!all || !all.length || !this.ctx) return;
    const ctx = this.ctx, cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const sx = (x) => (x - this.cx) * this.k * dpr + cv.width / 2, sy = (z) => (z - this.cz) * this.k * dpr + cv.height / 2;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const N of all) {
      ctx.lineWidth = Math.max(2, 3 * dpr); ctx.strokeStyle = N.color;
      ctx.beginPath();
      N.path.forEach((c, i) => { if (i === 0) ctx.moveTo(sx(c[0] + 0.5), sy(c[2] + 0.5)); else if (i % 3 === 0 || i === N.path.length - 1) ctx.lineTo(sx(c[0] + 0.5), sy(c[2] + 0.5)); });
      ctx.stroke();
    }
    ctx.font = '700 ' + Math.round(11 * dpr) + 'px system-ui, sans-serif';
    for (const N of all) for (const s of N.stations) {
      const x = sx(s.c[0] + 0.5), y = sy(s.c[2] + 0.5);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = s.transfer.length ? '#111' : N.color; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.arc(x, y, (s.transfer.length ? 6.5 : 5) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
    if (o[1] === 'M') {
      const x = Number(o[2]), z = Number(o[3]);
      if (Number.isFinite(x) && Number.isFinite(z)) MetroBuild.start(x, z, false, { line: Number(o[4]) || 1, name: typeof o[5] === 'string' ? o[5] : '', newLine: o[6] ? Number(o[4]) : 0 });
      return;
    }
    return ap.call(this, r, o);
  };
  // closing the panels with Escape
  window.addEventListener('keydown', (e) => {
    if (MetroMap.open && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); MetroMap.close(); return; }
    if (MetroPanel.open && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); MetroPanel.close(); }
  }, true);
}

// ---------------------------------------------------------------- fares ----
// The gates in new stations let you onto the platform with a metro card (10 trips, sold by the
// ticket machine next to them); going out is free. In creative mode they always open.
Object.assign(I, { METRO_CARD: 433 });
defItem(I.METRO_CARD, 'Metro Card · 10 trips', { sprite: 'i_metro_card', stack: 1, dur: 10, cat: 'transport' });
const METRO_CARD_PRICE = 20;
const Fare = {
  inside: null, last: null, warnT: 0,

  card() {
    const inv = G.inv;
    for (let i = 0; i < inv.slots.length; i++) { const s = inv.slots[i]; if (s && s.id === I.METRO_CARD && (s.dmg || 0) < 10) return i; }
    return -1;
  },
  pay() {
    if (G.mode === 'creative') return true;
    const i = this.card();
    if (i < 0) return false;
    const s = G.inv.slots[i];
    s.dmg = (s.dmg || 0) + 1;
    const left = 10 - s.dmg;
    if (left <= 0) { G.inv.slots[i] = null; G.ui.toast('🎫 That was the last trip on your card', 2500); }
    else G.ui.toast('🎫 Trips left: ' + left, 1400);
    G.ui.invDirty();
    return true;
  },
  update(dt) {
    const p = G.player, w = G.world;
    this.warnT -= dt;
    if (!p || p.seat || G.vehicle || !G.playing) { this.last = p ? p.pos.slice() : null; return; }
    const x = Math.floor(p.pos[0]), y = Math.floor(p.pos[1] + 0.1), z = Math.floor(p.pos[2]);
    if (w.getBlock(x, y, z) === B.TURNSTILE) {
      const key = posKey(x, y, z);
      if (this.inside !== key && this.last) {
        const f = w.getFacing(x, y, z), dv = FACE_DIR[f & 7] || [0, 0, -1];
        const from = (this.last[0] - (x + 0.5)) * dv[0] + (this.last[2] - (z + 0.5)) * dv[2];
        if (from < 0) {
          // coming from the street: the card opens the gate
          if (!this.pay()) {
            p.pos = this.last.slice(); p.vel[0] = p.vel[2] = 0;
            if (this.warnT <= 0) { this.warnT = 2.5; G.ui.toast('🎫 You need a metro card: the ticket machine sells them (' + METRO_CARD_PRICE + ' coins)', 3000); sfx('gate_no', [x + 0.5, y + 1, z + 0.5], 1, 1); }
            return;
          }
          sfx('gate_ok', [x + 0.5, y + 1, z + 0.5], 1, 1);
        }
        this.inside = key;
      }
    } else this.inside = null;
    this.last = p.pos.slice();
  },
  buy(x, y, z) {
    if (G.mode === 'survival') {
      if ((G.money | 0) < METRO_CARD_PRICE) { G.ui.toast('🎫 A metro card costs ' + METRO_CARD_PRICE + ' coins (you have ' + (G.money | 0) + ')', 3000); return; }
      G.money -= METRO_CARD_PRICE;
      if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh();
    }
    const card = mkStack(I.METRO_CARD, 1);
    if (!G.inv.add(card)) Ents.spawnItem(card, x + 0.5, y + 1, z + 0.5);
    G.ui.invDirty();
    sfx('gate_ok', [x + 0.5, y + 0.5, z + 0.5], 1, 0.8);
    G.ui.toast('🎫 Metro card · 10 trips' + (G.mode === 'survival' ? ' · −' + METRO_CARD_PRICE + ' coins' : ''), 2500);
  },
};
SYNTH.gate_ok = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.09, { wave: 'sine', f0: 1320 * p, f1: 1320 * p, gain: 0.12 }); Sound.tone(ctx, o, t + 0.1, 0.12, { wave: 'sine', f0: 1760 * p, f1: 1760 * p, gain: 0.12 }); };
SYNTH.gate_no = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.3, { wave: 'square', f0: 220 * p, f1: 200 * p, gain: 0.06 }); };
{
  const mu = Metro.update;
  Metro.update = function (dt) { mu.call(this, dt); Fare.update(dt); };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.block && t.block.id === B.TICKET_MACHINE && !G.player.sneaking) { const [x, y, z] = t.block.pos; Fare.buy(x, y, z); this.swingHand(); return true; }
    return use.call(this, initial);
  };
}
gen('turnstile_reader', (d, rng, ctx) => fillTile(d, (x, y, k) => {
  const pad = x >= 8 && x <= 23 && y >= 8 && y <= 23, led = y >= 26 && y <= 28 && x >= 12 && x <= 19;
  put(d, x, y, led ? [70, 230, 110] : pad ? [40, 90, 180] : [30, 32, 36], 0.92 + rng() * 0.08);
  if (led) ctx.emit[k] = 1; else if (pad) ctx.emit[k] = 0.35;
}), { smooth: 0.8, bump: 0.1 });
gen('ticket_front', (d, rng, ctx) => fillTile(d, (x, y, k) => {
  let c = [70, 74, 82], e = 0;
  if (x >= 4 && x <= 27 && y >= 3 && y <= 14) { c = [22, 40, 70]; e = 0.6; if (y >= 5 && y <= 8 && x >= 6 && x <= 10) { c = [214, 40, 50]; e = 0.9; } if (y === 11 && x >= 6 && x <= 24 && x % 2) { c = [200, 220, 240]; e = 0.8; } }
  else if (y >= 18 && y <= 20 && x >= 10 && x <= 21) { c = [18, 18, 20]; }                  // card slot
  else if (y >= 24 && y <= 28 && x >= 6 && x <= 25) { c = [40, 42, 46]; if (x % 5 === 0) c = [230, 190, 60]; }
  put(d, x, y, c, 0.92 + rng() * 0.08);
  ctx.emit[k] = e;
}), { smooth: 0.7, bump: 0.3 });
sprite('i_metro_card', (d) => {
  sprRect(d, 3, 8, 29, 25, [236, 238, 240]);
  sprRect(d, 3, 8, 29, 12, [214, 40, 50]);
  sprRect(d, 5, 15, 12, 22, [214, 40, 50]);
  sprRect(d, 7, 16, 8, 21, [255, 255, 255]); sprRect(d, 9, 16, 10, 21, [255, 255, 255]); sprRect(d, 8, 17, 9, 18, [255, 255, 255]);
  sprRect(d, 15, 16, 27, 17, [90, 96, 110]); sprRect(d, 15, 19, 24, 20, [90, 96, 110]);
  sprRect(d, 22, 21, 28, 24, [230, 190, 60]);
});
shaped(B.TURNSTILE, 1, ['I I', 'IWI', 'I I'], { I: I.IRON_INGOT, W: B.WIRE });
shaped(B.TICKET_MACHINE, 1, ['III', 'IGI', 'IPI'], { I: I.IRON_INGOT, G: B.GLASS_PANE, P: I.PAPER || B.PLANKS });

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
