'use strict';
// Houses for sale on the sixteen plots of the STUCOM district (district.js lists them in
// plan.plots). Right-click the "SOLAR LLIURE" sign's plinth, or open the estate agent on a
// computer, pick a house and pay: builders put it up in front of you in about twenty seconds,
// furnished, and the plot becomes yours (a Plot Stone by the gate: on a server only you and the
// friends you trust build there). Three kinds:
// - Xalet: a detached two-storey house with a tiled roof, a garden, a terrace and a pool.
// - Cases adossades: two brick town houses side by side, three floors and a roof terrace.
// - Bloc de pisos: four flats one above the other with a lift, balconies and a roof garden.
// On a server the purchase goes out as one op ('HS'): every player builds the same house from
// the same plan, like the metro works.

const HOME_TYPES = {
  xalet: { name: 'Xalet', icon: '🏡', price: 900, text: 'Detached house · 2 floors · garden, terrace and pool', floors: 2 },
  adossat: { name: 'Cases adossades', icon: '🏘️', price: 700, text: 'Two brick town houses · 3 floors · roof terrace', floors: 3 },
  pisos: { name: 'Bloc de pisos', icon: '🏢', price: 1400, text: 'Four flats · lift · balconies · roof garden', floors: 4 },
};
const HOME_BUILD_TIME = 20;

const Homes = {
  jobs: [],
  plots() {
    const w = G.world;
    try { const s = w && w.gen && w.gen.structs && typeof stucomVillage === 'function' ? stucomVillage(w.gen) : null; return s && s.plots ? s.plots : []; } catch (e) { return []; }
  },
  rec() { const w = G.world; return w.homes || (w.homes = {}); },
  plotAt(x, z) { return this.plots().find((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) || null; },
  bySign(x, y, z) { return this.plots().find((p) => (x === p.sign[0] || x === p.sign[0] + 1) && z === p.sign[1] && y >= p.F && y <= p.F + 1) || null; },
  // something built there already (by a player, not the plot's own posts and sign)?
  busy(p) {
    const w = G.world;
    let n = 0;
    for (let x = p.x0 + 1; x < p.x1; x++) for (let z = p.z0 + 1; z < p.z1; z++) for (let y = p.F; y <= p.F + 10; y++) {
      const id = w.getBlock(x, y, z);
      if (id !== B.AIR && BLOCK_RT[id] !== RT_CROSS && id !== B.QUARTZ_BLOCK) n++;
    }
    return n > 4;
  },

  // ---- the plans ----
  blocks(p, type) {
    const out = new Map(), pics = [];
    const W = { set: (x, y, z, id, f) => out.set(posKey(x, y, z), [x, y, z, id, f]), get: () => B.AIR, has: () => true, pic: () => {} };
    const F = p.F, fr = p.front;
    const X = (a) => p.x0 + a, Z = (d) => (fr > 0 ? p.z1 - d : p.z0 + d);
    const S = (a, y, d, id, f) => W.set(X(a), F + y, Z(d), id, f);
    const out4 = fr > 0 ? 4 : 5, inw = fr > 0 ? 5 : 4;   // facings towards the street / the back
    const R = 0, Lf = 1;                                   // backs towards +a / -a
    // the site: cleared, lawn, the kerb and the corner posts stay
    for (let a = 1; a <= 12; a++) for (let d = 0; d <= 13; d++) {
      for (let y = 0; y <= 20; y++) S(a, y, d, B.AIR);
      S(a, -1, d, d === 0 || d === 13 ? B.POLISHED_ANDESITE : B.GRASS);
    }
    const box = (a0, a1, d0, d1, y0, y1, id) => { for (let a = a0; a <= a1; a++) for (let d = d0; d <= d1; d++) for (let y = y0; y <= y1; y++) S(a, y, d, id); };
    const walls = (a0, a1, d0, d1, y0, y1, id) => { for (let a = a0; a <= a1; a++) for (let d = d0; d <= d1; d++) if (a === a0 || a === a1 || d === d0 || d === d1) for (let y = y0; y <= y1; y++) S(a, y, d, id); };
    const door = (a, d, f) => { S(a, 0, d, B.DOOR, f); S(a, 1, d, B.DOOR_TOP, f); };
    const bed = (a, d, y, f) => {
      // head at (a, d) and the next block across: the foot one step towards the front of the bed
      const fx = Furniture.front(f), side = furnSide(f);
      const L = (x, z) => [X(a) + x, F + y, Z(d) + z];
      const put = (dx, dz, id, ff) => { const [x, yy, z] = L(dx, dz); W.set(x, yy, z, id, ff); };
      put(0, 0, B.DOUBLE_BED_HEAD, f); put(side[0], side[2], B.DOUBLE_BED_HEAD, f | 8);
      put(fx[0], fx[2], B.DOUBLE_BED, f); put(fx[0] + side[0], fx[2] + side[2], B.DOUBLE_BED, f | 8);
    };
    let stone;
    if (type === 'xalet') {
      // garden: path, fence with a gate, a tree, flowers
      for (let d = 0; d <= 3; d++) for (const a of [6, 7]) S(a, -1, d, B.PANOT);
      for (let a = 1; a <= 12; a++) { if (a < 6 || a > 7) S(a, 0, 0, B.DARK_OAK_FENCE); S(a, 0, 13, B.DARK_OAK_FENCE); }
      for (let d = 1; d <= 12; d++) { S(1, 0, d, B.DARK_OAK_FENCE); S(12, 0, d, B.DARK_OAK_FENCE); }
      campusTree(W, X(10), F, Z(1), 'birch', 5);
      for (const a of [2, 3, 4, 9]) S(a, 0, 1, [B.TULIP, B.DAISY, B.CORNFLOWER, B.DANDELION][a % 4]);
      // the house: a 2..11, d 3..9; ground floor F..F+3, upper floor slab at F+4
      box(3, 10, 4, 8, -1, -1, B.SPRUCE_PLANKS);
      walls(2, 11, 3, 9, 0, 0, B.STONE_BRICKS);
      walls(2, 11, 3, 9, 1, 7, B.PLASTER);
      for (const [a, d] of [[2, 3], [11, 3], [2, 9], [11, 9]]) for (let y = 0; y <= 7; y++) S(a, y, d, B.DARK_OAK_PLANKS);
      box(3, 10, 4, 8, 4, 4, B.SPRUCE_PLANKS);
      walls(2, 11, 3, 9, 4, 4, B.DARK_OAK_PLANKS);
      // windows and doors
      for (const a of [3, 4, 9, 10]) for (const y of [1, 2, 5, 6]) S(a, y, 3, B.GLASS_PANE);
      for (const a of [6, 7]) for (const y of [5, 6]) S(a, y, 3, B.GLASS_PANE);
      for (const d of [5, 6, 7]) for (const y of [1, 2, 5, 6]) { S(2, y, d, B.GLASS_PANE); S(11, y, d, B.GLASS_PANE); }
      door(7, 3, out4); S(6, 1, 3, B.GLASS_PANE); S(6, 2, 3, B.PLASTER);
      for (const a of [4, 5, 6]) for (const y of [0, 1, 2]) S(a, y, 9, B.GLASS_PANE);
      door(8, 9, inw);
      // porch light and canopy
      for (const a of [6, 7, 8]) S(a, 3, 2, B.PLANK_SLAB, 8);
      S(7, 2, 2, B.LANTERN, 8);
      // stairs along the back wall, up towards +a, with a hole and a railing above
      for (let k = 0; k <= 4; k++) {
        S(3 + k, k, 8, shapeId('oak', 'stairs'), R);
        for (let y = 0; y < k; y++) S(3 + k, y, 8, B.SPRUCE_PLANKS);
        for (let y = k + 1; y <= Math.min(k + 3, 7); y++) if (y !== 4 || k < 4) S(3 + k, y, 8, B.AIR);
      }
      for (let a = 3; a <= 6; a++) S(a, 5, 7, B.DARK_OAK_FENCE);
      // ground floor: living room and kitchen
      S(3, 0, 5, B.SOFA_GRAY, Lf); S(3, 0, 6, B.SOFA_GRAY, Lf);
      for (let a = 4; a <= 5; a++) for (let d = 4; d <= 7; d++) S(a, 0, d, B.RUG_BEIGE, 0);
      S(4, 0, 5, B.COFFEE_TABLE, Lf); S(6, 0, 5, B.TV_ON, R); S(3, 0, 4, B.FLOOR_LAMP, 0);
      S(10, 0, 4, B.KITCHEN_COUNTER, R); S(10, 0, 5, B.KITCHEN_SINK, R); S(10, 0, 6, B.STOVE, R); S(10, 0, 7, B.FRIDGE, R); S(10, 1, 7, B.FRIDGE_TOP, R);
      S(8, 0, 5, B.TABLE, 0); S(8, 0, 6, B.TABLE, 0); S(9, 0, 5, B.CHAIR, R); S(9, 0, 6, B.CHAIR, R); S(7, 0, 5, B.CHAIR, Lf);
      S(5, 3, 5, B.CEILING_LAMP, 0); S(9, 3, 5, B.CEILING_LAMP, 0);
      S(3, 2, 7, B.PAINTING_SEA, Lf);
      // upstairs: bedroom and bathroom
      bed(3, 5, 5, Lf);
      S(3, 5, 4, B.FLOOR_LAMP, 0); S(3, 6, 7, B.PAINTING_FLOWERS, Lf);
      S(10, 5, 4, B.SHOWER, R); S(10, 6, 4, B.SHOWER_TOP, R); S(10, 5, 5, B.TOILET, R); S(10, 5, 6, B.WASHER, R);
      for (let d = 4; d <= 6; d++) S(9, 5, d, B.RUG_BLUE, 0);
      S(8, 5, 8, B.TABLE, 0); S(8, 6, 8, B.DESKTOP_PC, out4); S(8, 5, 7, B.CHAIR, inw);
      S(5, 7, 5, B.CEILING_LAMP, 0); S(9, 7, 6, B.CEILING_LAMP, 0);
      // roof
      roofGable(W, X(2), Math.min(Z(3), Z(9)), X(11), Math.max(Z(3), Z(9)), F + 8, { roof: 'tiles', ridge: B.ROOF_TILES }, B.PLASTER);
      // back garden: decking terrace and a pool
      for (let a = 2; a <= 11; a++) for (let d = 10; d <= 12; d++) S(a, -1, d, B.DECK);
      for (let a = 3; a <= 7; a++) for (let d = 10; d <= 12; d++) { S(a, -1, d, B.WATER); S(a, -2, d, B.BLUE_TILES); }
      for (let a = 2; a <= 8; a++) for (const d of [10, 12]) if (a === 2 || a === 8) S(a, -1, d, B.QUARTZ_BLOCK);
      S(10, 0, 11, B.TABLE, 0); S(9, 0, 11, B.CHAIR, R); S(11, 0, 11, B.CHAIR, Lf);
      stone = [2, 0, 1];
    } else if (type === 'adossat') {
      const unit = (m) => {
        const A = (a) => (m ? 13 - a : a), fL = m ? R : Lf, fR = m ? Lf : R;
        const T = (a, y, d, id, f) => S(A(a), y, d, id, f);
        // shell a 1..6, d 2..11, floors walk at 0, 4, 8; slabs at 3, 7; roof 11
        for (let a = 1; a <= 6; a++) for (let d = 2; d <= 11; d++) {
          const edge = a === 1 || a === 6 || d === 2 || d === 11;
          for (let y = -1; y <= 12; y++) {
            let id = B.AIR;
            if (y === -1) id = B.SPRUCE_PLANKS;
            else if (y === 3 || y === 7) id = edge ? B.STONE_BRICKS : B.SPRUCE_PLANKS;
            else if (y === 11) id = edge ? B.STONE_BRICKS : B.DECK;
            else if (y === 12) id = edge ? (d === 2 ? B.IRON_BARS : B.BRICKS) : B.AIR;
            else if (edge) id = B.BRICKS;
            T(a, y, d, id);
          }
        }
        // front: door, windows, balconies
        T(3, 0, 2, B.DOOR, out4); T(3, 1, 2, B.DOOR_TOP, out4); T(3, 2, 2, B.GLASS_PANE);
        for (const y of [1, 2]) T(5, y, 2, B.GLASS_PANE);
        for (const y0 of [4, 8]) {
          for (const a of [2, 3, 4, 5]) for (const y of [y0, y0 + 1, y0 + 2]) T(a, y, 2, a === 3 && y < y0 + 2 ? (y === y0 ? B.DOOR : B.DOOR_TOP) : B.GLASS_PANE, a === 3 ? out4 : undefined);
          for (const a of [2, 3, 4, 5]) { T(a, y0 - 1, 1, B.STONE_BRICKS); T(a, y0, 1, B.IRON_BARS); }
          T(5, y0 - 1 + 1, 1, B.AIR); T(5, y0, 1, B.IRON_BARS);
        }
        for (const y of [1, 2, 5, 6, 9, 10]) for (const d of [5, 8]) T(1, y, d, B.GLASS_PANE);
        for (const y of [1, 2, 5, 6, 9, 10]) T(3, y, 11, B.GLASS_PANE);
        // stairs: a = 2 up towards +d (0 -> 3), then a = 3 up towards -d (4 -> 7), a ladder to the roof
        for (let k = 0; k <= 3; k++) {
          T(2, k, 6 + k, shapeId('oak', 'stairs'), inw);
          for (let y = 0; y < k; y++) T(2, y, 6 + k, B.SPRUCE_PLANKS);
          for (let y = k + 1; y <= k + 3; y++) if (y !== 3 || k === 3) { if (!(y === 3 && k === 3)) T(2, y, 6 + k, B.AIR); }
          T(3, 4 + k, 9 - k, shapeId('oak', 'stairs'), out4);
          for (let y = 4; y < 4 + k; y++) T(3, y, 9 - k, B.SPRUCE_PLANKS);
          for (let y = 5 + k; y <= 7 + k; y++) if (!(y === 7 && k === 3)) T(3, y, 9 - k, B.AIR);
        }
        for (let d = 6; d <= 8; d++) T(2, 3, d, B.AIR);
        for (let d = 7; d <= 9; d++) T(3, 7, d, B.AIR);
        for (let y = 8; y <= 11; y++) T(5, y, 10, B.LADDER, inw);
        T(5, 11, 10, B.AIR);
        // rooms
        T(5, 0, 4, B.SOFA_RED, fR); T(5, 0, 5, B.SOFA_RED, fR); T(3, 0, 4, B.TV_ON, fL); T(4, 0, 9, B.KITCHEN_COUNTER, inw); T(5, 0, 9, B.STOVE, inw); T(5, 0, 7, B.FRIDGE, fR); T(5, 1, 7, B.FRIDGE_TOP, fR);
        T(4, 2, 5, B.CEILING_LAMP, 0);
        bed(5, 4, 4, fR); T(4, 6, 6, B.CEILING_LAMP, 0); T(5, 5, 7, B.PAINTING_CITY, fR);
        T(5, 8, 4, B.SHOWER, fR); T(5, 9, 4, B.SHOWER_TOP, fR); T(5, 8, 6, B.TOILET, fR); T(2, 8, 4, B.TABLE, 0); T(2, 9, 4, B.DESKTOP_PC, inw); T(2, 8, 3, B.CHAIR, out4);
        T(4, 10, 6, B.CEILING_LAMP, 0);
        // roof terrace
        T(3, 12, 5, B.TABLE, 0); T(2, 12, 5, B.CHAIR, fL); T(4, 12, 5, B.CHAIR, fR);
        T(2, 12, 8, B.PODZOL); T(2, 13, 8, B.BUSH);
      };
      unit(false); unit(true);
      for (let a = 1; a <= 12; a++) S(a, -1, 1, B.PANOT);
      for (const a of [3, 10]) S(a, -1, 0, B.PANOT);
      for (let a = 1; a <= 12; a++) for (let d = 12; d <= 12; d++) S(a, 0, d, B.DARK_OAK_FENCE);
      stone = [6, 0, 12];
      S(6, 0, 12, B.AIR); S(7, 0, 12, B.AIR);
    } else {
      // the block of flats: a 1..12, d 2..11, four floors 4 apart, a lift at a = 11, d = 9..10
      const top = 16;
      for (let a = 1; a <= 12; a++) for (let d = 2; d <= 11; d++) {
        const edge = a === 1 || a === 12 || d === 2 || d === 11;
        for (let y = -1; y <= top + 1; y++) {
          let id = B.AIR;
          const slab = y === -1 || y === 3 || y === 7 || y === 11 || y === 15;
          if (slab) id = edge ? B.CONCRETE + 8 : y === 15 ? B.DECK : B.TERRAZZO;
          else if (y === 16) id = edge ? B.GLASS_PANE : B.AIR;
          else if (y > 16) id = B.AIR;
          else if (edge) id = (d === 2 || d === 11) && a > 1 && a < 12 && (y % 4 === 1 || y % 4 === 2) ? B.GLASS_PANE : B.CONCRETE;
          S(a, y, d, id);
        }
      }
      // the lift shaft with a plate on every floor and on the roof, glass doors in front
      for (let y = -1; y <= top + 2; y++) for (const d of [9, 10]) {
        const plate = y === -1 || y === 3 || y === 7 || y === 11 || y === 15;
        S(11, y, d, plate ? B.LIFT_FLOOR : B.AIR);
      }
      for (let y = 0; y <= top + 2; y++) { S(11, y, 8, B.GLASS_PANE); S(11, y, 11, y < 15 ? B.CONCRETE : B.GLASS_PANE); S(12, y, 9, B.GLASS_PANE); S(12, y, 10, B.GLASS_PANE); }
      for (const y0 of [0, 4, 8, 12, 16]) for (const d of [9, 10]) { S(10, y0, d, B.AIR); S(10, y0 + 1, d, B.AIR); if (y0 > 0 && y0 < 16) S(10, y0 + 2, d, B.CONCRETE); }
      for (let y = 16; y <= 18; y++) for (const d of [8, 11]) S(10, y, d, B.GLASS_PANE);
      for (let a = 10; a <= 12; a++) for (let d = 8; d <= 11; d++) S(a, 19, d, B.CONCRETE + 8);
      S(11, 19, 9, B.GLOWSTONE); S(11, 19, 10, B.GLOWSTONE);
      // entrance and balconies
      door(6, 2, out4); S(7, 0, 2, B.DOOR, out4); S(7, 1, 2, B.DOOR_TOP, out4);
      for (const a of [6, 7]) S(a, 2, 1, B.CONCRETE + 8);
      for (const y0 of [4, 8, 12]) for (let a = 2; a <= 11; a++) { S(a, y0 - 1, 1, B.CONCRETE + 8); S(a, y0, 1, B.GLASS_PANE); }
      for (const y0 of [4, 8, 12]) for (const a of [4, 8]) { S(a, y0, 2, B.DOOR, out4); S(a, y0 + 1, 2, B.DOOR_TOP, out4); }
      // each flat: living room at the front, bedroom and bathroom at the back
      [4, 8, 12].forEach((y0, i) => {
        S(2, y0, 4, B.SOFA_BLUE + 0, Lf); S(2, y0, 5, B.SOFA_BLUE, Lf); S(4, y0, 4, B.COFFEE_TABLE, Lf); S(5, y0, 4, B.TV_ON, R);
        S(2, y0, 7, B.KITCHEN_COUNTER, Lf); S(2, y0, 8, B.STOVE, Lf); S(2, y0, 9, B.FRIDGE, Lf); S(2, y0 + 1, 9, B.FRIDGE_TOP, Lf);
        bed(7, y0, 9, inw === 5 ? 5 : 4);
        S(9, y0, 7, B.SHOWER, R); S(9, y0 + 1, 7, B.SHOWER_TOP, R); S(9, y0, 6, B.TOILET, R);
        S(4, y0 + 2, 5, B.CEILING_LAMP, 0); S(7, y0 + 2, 8, B.CEILING_LAMP, 0);
        S(6, y0 + 1, 10, [B.PAINTING_SEA, B.PAINTING_CITY, B.PAINTING_ABSTRACT][i], inw);
      });
      // ground floor lobby
      for (let a = 2; a <= 9; a++) for (let d = 3; d <= 10; d++) S(a, -1, d, B.QUARTZ_BLOCK || B.TERRAZZO);
      S(2, 0, 9, B.PODZOL); S(2, 1, 9, B.BUSH); S(9, 0, 3, B.PODZOL); S(9, 1, 3, B.BUSH); S(5, 2, 6, B.CEILING_LAMP, 0);
      S(2, 0, 5, B.SOFA_GRAY, Lf); S(2, 0, 6, B.SOFA_GRAY, Lf);
      // roof garden
      for (const [a, d] of [[3, 4], [6, 4], [3, 8], [6, 8]]) { S(a, 16, d, B.PODZOL); S(a, 17, d, B.BUSH); }
      S(8, 16, 5, B.TABLE, 0); S(7, 16, 5, B.CHAIR, R); S(9, 16, 5, B.CHAIR, Lf);
      for (let a = 1; a <= 12; a++) S(a, -1, 1, B.PANOT);
      stone = [1, 0, 0];
      S(1, 0, 0, B.AIR);
    }
    if (stone) S(stone[0], stone[1], stone[2], B.PLOT_STONE);
    const list = [...out.values()];
    // bottom up, and within a layer from the middle out: it looks like it is being built
    const mx = (p.x0 + p.x1) / 2, mz = (p.z0 + p.z1) / 2;
    list.sort((u, v) => (u[1] - v[1]) || ((Math.abs(u[0] - mx) + Math.abs(u[2] - mz)) - (Math.abs(v[0] - mx) + Math.abs(v[2] - mz))));
    return { list, stone: stone ? [X(stone[0]), F + stone[1], Z(stone[2])] : null, pics };
  },

  // ---- buying ----
  buy(p, type, owner, name, remote) {
    const T = HOME_TYPES[type];
    if (!T || !p) return false;
    const R = this.rec();
    if (!remote) {
      if (R[p.id]) { G.ui.toast('This plot is already sold'); return false; }
      if (this.busy(p)) { G.ui.toast('Somebody has already built on this plot'); return false; }
      if (!Shops.pay(T.price)) { G.ui.toast('🪙 A ' + T.name + ' costs ' + T.price + ' coins'); sfx('gate_no', null, 0.6, 1); return false; }
    }
    R[p.id] = { o: owner, n: name, type, t: Date.now() };
    const { list, stone } = this.blocks(p, type);
    const w = G.world;
    // skip what is already right
    const todo = list.filter(([x, y, z, id, f]) => w.getBlock(x, y, z) !== id || (f !== undefined && w.getFacing(x, y, z) !== f));
    this.jobs.push({ p, type, list: todo, i: 0, rate: Math.max(60, todo.length / HOME_BUILD_TIME), acc: 0, mine: !remote, stone, owner, name });
    if (!remote) {
      if (Net.on) Net.op(['HS', p.id, type, name]);
      if (typeof SharedState !== 'undefined') SharedState.put('home:' + p.id, R[p.id]);
      G.ui.banner(T.icon, 'Sold! The builders are putting up your ' + T.name);
      sfx('shop_till', null, 0.8, 1);
    }
    return true;
  },

  update(dt) {
    const j = this.jobs[0];
    if (!j || !G.world) return;
    const w = G.world;
    j.acc += dt * j.rate;
    const n = Math.floor(j.acc);
    if (n <= 0) return;
    j.acc -= n;
    const was = Net.capture, cloud = Net.cloudOnly;
    Net.capture = false; Net.cloudOnly = j.mine;
    try {
      const batch = [];
      const end = Math.min(j.list.length, j.i + n);
      for (; j.i < end; j.i++) {
        const [x, y, z, id, f] = j.list[j.i];
        if (w.isLoaded(x, z)) batch.push([x, y, z, id, f]);
        else { Net.applyEdit(x, y, z, id, f); if (Net.on && Net.server && j.mine) Cloud.push(x, y, z, id, f === undefined ? -1 : f, nowSec()); }
      }
      if (batch.length) {
        editBlocks(batch);
        const b = batch[batch.length - 1];
        if (Math.random() < 0.5) Particles.poof(b[0] + 0.5, b[1] + 0.5, b[2] + 0.5, 1, 1);
        if (Math.random() < dt * 6) sfx('place_' + (BLOCK_SOUND[b[3]] || 1), [b[0] + 0.5, b[1] + 0.5, b[2] + 0.5], 0.5, rand(0.8, 1.1));
      }
    } finally { Net.capture = was; Net.cloudOnly = cloud; }
    if (j.i >= j.list.length) {
      this.jobs.shift();
      // the "SOLAR LLIURE" sign comes down
      Homes.hideSign(j.p);
      if (j.stone) {
        const [x, y, z] = j.stone, id = String(posKey(x, y, z));
        if (!Claims.map.has(id)) Claims.apply(id, { o: j.owner, n: j.name, x, y, z, r: 7, trust: [], tn: {}, open: false, t: Date.now() }, true);
        if (j.mine) { const c = Claims.map.get(id); if (c) Claims.share(c); if (typeof Home !== 'undefined') Home.set([x + 0.5, y, z + 0.5], 'set'); }
      }
      w.editsDirty = true;
      if (j.mine) { G.ui.banner(HOME_TYPES[j.type].icon, 'Welcome home! Your ' + HOME_TYPES[j.type].name + ' is ready'); sfx('achieve', null, 1, 1); saveWorld(); }
    }
  },

  // generated signs come back with every chunk load: sold plots drop theirs
  hideSign(p) {
    if (!G.genPics) return;
    for (const [k, q] of G.genPics) if (q.builtin === 'plot' && q.x >= p.x0 - 1 && q.x <= p.x1 + 1 && q.z >= p.z0 - 1 && q.z <= p.z1 + 1) G.genPics.delete(k);
  },

  // ---- the estate agent ----
  open(p) {
    const plots = this.plots();
    if (!plots.length) { G.ui.toast('Houses are sold on the plots of ' + CITY); return; }
    const R = this.rec();
    const q = GPanel.open({ title: ED('Immobiliària STUCOM', CITY + ' Real Estate'), sub: p ? 'Plot ' + p.id.slice(1) : plots.filter((x) => !R[x.id]).length + ' plots for sale', icon: '🏠', cls: 'gp-homes', width: 680 });
    const draw = () => {
      const e = GPanel.esc, money = G.mode === 'creative' ? '∞' : (G.money | 0);
      if (p) {
        const r = R[p.id];
        if (r) {
          const T = HOME_TYPES[r.type] || {};
          q.body.innerHTML = `<div class="gp-card"><div class="gp-big">${T.icon || '🏠'}</div><p><b>${e(T.name || 'House')}</b> · owned by <b>${e(r.n)}</b></p><p class="gp-dim">Bought ${agoText(r.t)}</p></div>`;
          return;
        }
        const busy = this.busy(p);
        q.body.innerHTML = `<p class="gp-dim" style="margin:0 0 12px">Choose a house for this plot (14 × 14). You have 🪙 ${money}. It is built in about ${HOME_BUILD_TIME} seconds, furnished, and the plot is yours.</p>
          ${busy ? '<p class="gp-dim" style="color:#ff8a7a">Something is already built here: clear it first.</p>' : ''}
          <div class="home-grid">${Object.entries(HOME_TYPES).map(([k, T]) => `<div class="home-card"><canvas width="220" height="140" data-prev="${k}"></canvas>
            <b>${T.icon} ${e(T.name)}</b><span>${e(T.text)}</span><button class="gp-btn ok" data-buy="${k}" ${busy ? 'disabled' : ''}>Buy · 🪙 ${T.price}</button></div>`).join('')}</div>`;
        q.body.querySelectorAll('canvas[data-prev]').forEach((c) => this.preview(c, c.dataset.prev));
        q.body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { if (this.buy(p, b.dataset.buy, Net.owner, Net.name)) q.close(); }));
        return;
      }
      // every plot, with a map
      q.body.innerHTML = `<div class="home-list">${plots.map((x) => {
        const r = R[x.id], T = r && HOME_TYPES[r.type];
        return `<div class="gp-row"><span class="pp-dot ${r ? '' : 'off'}" style="${r ? 'background:#3cf2c0' : ''}"></span><div class="gp-grow"><b>Plot ${x.id.slice(1)}</b><small>${r ? e((T ? T.icon + ' ' + T.name : 'House') + ' · ' + r.n) : 'For sale'} · ${People.dist([x.x0 + 7, x.F, x.z0 + 7])}</small></div>
          ${r ? '' : `<button class="gp-btn" data-see="${x.id}">See</button>`}</div>`;
      }).join('')}</div>`;
      q.body.querySelectorAll('[data-see]').forEach((b) => b.addEventListener('click', () => { q.close(); this.open(plots.find((x) => x.id === b.dataset.see)); }));
    };
    draw();
  },
  // a little drawing of each house
  preview(c, k) {
    const g = c.getContext('2d'), W = c.width, H = c.height;
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#8ec5ff'); sky.addColorStop(1, '#d9ecff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#6cc070'; g.fillRect(0, H - 26, W, 26);
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const win = (x, y, w = 14, h = 14) => { rect(x, y, w, h, '#2b4a6b'); rect(x + 2, y + 2, w / 2 - 3, h - 4, '#9fd0ff'); };
    if (k === 'xalet') {
      rect(55, 62, 110, 52, '#f2eee4'); rect(55, 108, 110, 6, '#9a9a92');
      g.fillStyle = '#b5532f'; g.beginPath(); g.moveTo(45, 64); g.lineTo(110, 28); g.lineTo(175, 64); g.fill();
      win(68, 74); win(138, 74); rect(102, 84, 16, 30, '#6b4a2a'); rect(40, 108, 20, 8, '#4fb3e8');
      g.fillStyle = '#3f8f45'; g.beginPath(); g.arc(190, 84, 16, 0, 7); g.fill(); rect(188, 96, 4, 18, '#7a5a3a');
    } else if (k === 'adossat') {
      for (const x0 of [50, 112]) { rect(x0, 34, 60, 80, '#b8563a'); rect(x0, 30, 60, 6, '#8a3f2a'); for (const y of [44, 68]) { win(x0 + 10, y); win(x0 + 36, y); rect(x0 + 6, y + 16, 48, 3, '#333'); } rect(x0 + 22, 92, 14, 22, x0 < 100 ? '#2a6ce0' : '#2fbf71'); }
    } else {
      rect(60, 16, 100, 98, '#eceae4'); for (let y = 24; y < 96; y += 22) { for (let x = 68; x < 150; x += 22) win(x, y); rect(62, y + 16, 96, 3, '#9aa'); }
      rect(100, 94, 20, 20, '#445'); rect(146, 16, 12, 98, '#b8d8f0');
    }
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block;
    if (initial && b && b.id === B.QUARTZ_BLOCK && !G.player.sneaking) {
      const p = Homes.bySign(b.pos[0], b.pos[1], b.pos[2]);
      if (p) { Homes.open(p); this.swingHand(); return true; }
    }
    return use.call(this, initial);
  };
  const loaded = Pictures.chunkLoaded;
  Pictures.chunkLoaded = function (c) {
    loaded.call(this, c);
    const R = G.world && G.world.homes;
    if (R) for (const p of Homes.plots()) if (R[p.id]) Homes.hideSign(p);
  };
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'HS') {
      const p = Homes.plots().find((x) => x.id === o[2]);
      if (p && HOME_TYPES[o[3]] && !Homes.rec()[p.id]) Homes.buy(p, o[3], r && r.owner, typeof o[4] === 'string' ? o[4].slice(0, 16) : 'Someone', true);
      return;
    }
    return ap.call(this, r, o);
  };
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) {
    if (k.startsWith('home:')) { if (v && typeof v === 'object' && HOME_TYPES[v.type]) Homes.rec()[k.slice(5)] = v; return; }
    return apply.call(this, k, v);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) {
    fu.call(this, dt);
    Homes.update(dt || 0.016);
    // a hint on walking onto a free plot
    Homes.hintT = (Homes.hintT || 0) - (dt || 0.016);
    if (Homes.hintT <= 0) {
      Homes.hintT = 0.5;
      const pp = G.player.pos, p = Homes.plotAt(Math.floor(pp[0]), Math.floor(pp[2]));
      if (p !== Homes.here && p && !Homes.rec()[p.id] && Math.abs(pp[1] - p.F) < 4) G.ui.toast('🏠 Plot ' + p.id.slice(1) + ' for sale · right-click the sign to buy a house', 3000);
      Homes.here = p;
    }
  };
  PC.add({ key: 'homes', icon: '🏠', name: 'Immobiliària', run() { Homes.open(null); } });
}
