'use strict';
// Growing STUCOM: the Town Planning Board (a block in Plaça Universitat, also craftable) shows the
// district's grid of blocks and lets you add a new one next to any that is built: its streets
// all round (pavements, crossings, trees, lamps), levelled to the district's ground, and inside
// four building plots, open flat land, a park or a paved square. Every built block has a Survey
// Stone under its middle (the first nine come with the world), which is how the board knows.
// Built over a few seconds like the metro works (op 'C' online, the cloud keeps the blocks).

const CITY_TYPES = [
  { k: 'plots', icon: '🏗️', name: 'Building plots', desc: 'Four fenced 14×14 plots with paths between them' },
  { k: 'open', icon: '🟩', name: 'Open flat land', desc: 'A whole 36×36 block of flat grass to build on' },
  { k: 'park', icon: '🌳', name: 'Park', desc: 'Lawns, trees, paths, benches and a fountain garden' },
  { k: 'square', icon: '⛲', name: 'Square', desc: 'A paved square with trees, benches and lamps' },
  { k: 'towers', icon: '🏙️', name: 'Skyscrapers', desc: 'Two glass towers with lifts: flats for sale on every floor', cost: 1500, max: 120000 },
];
const CITY_RANGE = 5, CITY_COST = 300, CITY_MAX_EDITS = 30000;

const City = {
  plan() {
    const g = G.world && G.world.gen;
    const st = g && g.structs && typeof stucomVillage === 'function' ? stucomVillage(g) : null;
    return st && st.district ? st : null;
  },
  // a block without generating anything: loaded, else a saved edit, else unknown (null)
  known(x, y, z) {
    const w = G.world;
    if (w.isLoaded(x, z)) return w.getBlock(x, y, z);
    const e = w.edits.get(chunkKey(x >> 4, z >> 4));
    const id = e && e.get(blockIndex(x & 15, y, z & 15));
    return id === undefined ? null : id;
  },
  built(i, j) {
    if (Math.abs(i) <= (CG ? 2 : 1) && Math.abs(j) <= (CG ? 2 : 1)) return true;
    const st = this.plan();
    return !!st && this.known(st.x + i * DP, st.y - 6, st.z + j * DP) === B.CITY_MARK;
  },
  canBuild(i, j) {
    if (Math.abs(i) > CITY_RANGE || Math.abs(j) > CITY_RANGE || this.built(i, j)) return false;
    return this.built(i - 1, j) || this.built(i + 1, j) || this.built(i, j - 1) || this.built(i, j + 1);
  },

  // the blocks of a new district block (only those that change)
  blocks(i, j, type) {
    const st = this.plan(), D = st.district, { cx, cz } = D, F = st.y;
    const edits = new Map(), pics = [];
    const cur = (x, y, z) => { const k = posKey(x, y, z); return edits.has(k) ? edits.get(k)[3] : MetroNet.block(x, y, z); };
    const W = {
      x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9, has: () => true,
      get: (x, y, z) => cur(x, y, z),
      set(x, y, z, id, f) { if (y < 1 || y >= CH) return; if (cur(x, y, z) === id && f === undefined) return; edits.set(posKey(x, y, z), [x, y, z, id, f]); },
      pic(x, y, z, f, w, h, builtin) { pics.push({ id: 'c' + x + ',' + y + ',' + z, x, y, z, f, w, h, builtin }); },
      loot() {},
    };
    const u0 = i * DP - DI / 2, v0 = j * DP - DI / 2;          // the block itself: u0..u0+35
    // ground and street surfaces over the block and the streets round it
    for (let u = u0 - DS; u < u0 + DI + DS; u++) for (let v = v0 - DS; v < v0 + DI + DS; v++) {
      const x = cx + u, z = cz + v, h = MetroNet.surface(x, z).h;
      // filled down to the ground where it is lower (a terrace), dug out where it is higher
      for (let y = Math.min(h + 1, F - 5); y <= F - 2; y++) { const id = cur(x, y, z); if (!BLOCK_SOLID[id] || IS_LIQUID(id)) W.set(x, y, z, y >= F - 3 ? B.DIRT : B.STONE); }
      const inside = u >= u0 && u < u0 + DI && v >= v0 && v < v0 + DI;
      let top = districtTop(u, v);
      if (inside && top !== B.PANOT) top = type === 'square' ? ((u - u0) % 6 === 0 || (v - v0) % 6 === 0 ? B.POLISHED_ANDESITE : B.PANOT) : B.GRASS;
      if (inside && type === 'plots') top = districtTop(u, v) === B.PANOT && (Math.min(u - u0, u0 + DI - 1 - u) + Math.min(v - v0, v0 + DI - 1 - v) < 5) ? B.PANOT : (u - u0 >= 17 && u - u0 <= 18) || (v - v0 >= 17 && v - v0 <= 18) ? B.PANOT : B.GRASS;
      if (inside && type === 'park' && (Math.abs(u - u0 - 17.5) < 1 || Math.abs(v - v0 - 17.5) < 1)) top = B.PANOT;
      W.set(x, F - 1, z, top);
      for (let y = F; y <= Math.max(h, F) + 12 && y < CH; y++) if (cur(x, y, z) !== B.AIR) W.set(x, y, z, B.AIR);
    }
    W.set(cx + i * DP, F - 6, cz + j * DP, B.CITY_MARK);
    // what goes inside
    const X = (a) => cx + u0 + a, Z = (b) => cz + v0 + b;
    if (type === 'plots') buildPlotBlock(W, G.world.gen, { cx, cz, F }, u0, v0);
    else if (type === 'towers') buildCityBlock(W, G.world.gen, { cx, cz, F }, u0, v0, 'towers');
    else if (type === 'park') {
      buildGarden(W, G.world.gen, X(11), Z(11), F);
      for (const [a, b, k] of [[5, 5, 'oak'], [30, 5, 'cherry'], [5, 30, 'cherry'], [30, 30, 'oak'], [11, 3, 'birch'], [24, 32, 'birch'], [3, 24, 'oak'], [32, 11, 'oak']]) campusTree(W, X(a), F, Z(b), k, 5);
      for (const [a, b, f] of [[15, 8, 1], [15, 9, 1], [20, 26, 0], [20, 27, 0]]) W.set(X(a), F, Z(b), shapeId('oak', 'stairs'), f);
      for (const [a, b] of [[17, 2], [2, 18], [33, 17], [18, 33]]) campusLamp(W, X(a), F, Z(b));
    } else if (type === 'square') {
      for (const [a, b] of [[8, 8], [27, 8], [8, 27], [27, 27]]) {
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) { W.set(X(a + da), F - 1, Z(b + db), B.GRASS); if (da || db) W.set(X(a + da), F, Z(b + db), B.STONE_BRICK_SLAB); }
        campusTree(W, X(a), F, Z(b), (a + b) % 2 ? 'cherry' : 'oak', 5);
      }
      // a round fountain in the middle
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
        const r = Math.hypot(a, b), x = X(17 + a), z = Z(17 + b);
        if (r < 2.6) { W.set(x, F - 1, z, B.WATER); W.set(x, F - 2, z, B.PRISMARINE_BRICKS); }
        else if (r < 3.6) { W.set(x, F - 1, z, B.POLISHED_DIORITE); W.set(x, F, z, B.POLISHED_DIORITE_SLAB); }
      }
      for (let y = F - 2; y <= F; y++) W.set(X(17), y, Z(17), B.QUARTZ_PILLAR);
      W.set(X(17), F + 1, Z(17), B.SEA_LANTERN);
      for (const [a, b, f] of [[16, 11, 5], [17, 11, 5], [16, 23, 4], [17, 23, 4], [11, 16, 1], [11, 17, 1], [23, 16, 0], [23, 17, 0]]) W.set(X(a), F, Z(b), shapeId('oak', 'stairs'), f);
      for (const [a, b] of [[4, 17], [31, 17], [17, 4], [17, 31]]) campusLamp(W, X(a), F, Z(b));
    }
    // trees and lamps along the four streets round it
    for (const [b0, along] of [[u0 - DS, 'z'], [u0 + DI, 'z'], [v0 - DS, 'x'], [v0 + DI, 'x']]) for (let r = 0; r < DI; r++) {
      const kind = [5, 13, 22, 30].includes(r) ? 'tree' : r === 9 || r === 26 ? 'lamp' : null;
      if (!kind) continue;
      for (const s of [1, 8]) {
        const x = along === 'z' ? cx + b0 + s : cx + u0 + r, z = along === 'z' ? cz + v0 + r : cz + b0 + s;
        if (kind === 'lamp') campusLamp(W, x, F, z);
        else { W.set(x, F - 1, z, B.COARSE_DIRT); campusTree(W, x, F, z, hash3(x, 7, z, 3) < 0.5 ? 'oak' : 'birch', 5); }
      }
    }
    return { list: [...edits.values()], pics };
  },

  start(i, j, typeIdx, mine) {
    const type = CITY_TYPES[typeIdx];
    const st = this.plan();
    if (!st || !type) return false;
    if (mine && !this.canBuild(i, j)) { G.ui.toast('🏗️ You can only add a block next to one that is built'); return false; }
    const { list, pics } = this.blocks(i, j, type.k);
    if (mine && list.length > (type.max || CITY_MAX_EDITS)) { G.ui.toast('🏗️ The ground there is too uneven: grow the district from the flat land first', 4500); return false; }
    if (mine) {
      if (G.mode === 'survival') {
        const cost = type.cost || CITY_COST;
        if ((G.money | 0) < cost) { G.ui.toast('🏗️ This block costs ' + cost + ' coins (you have ' + (G.money | 0) + ')', 4000); return false; }
        G.money -= cost;
      }
      if (Net.on) Net.op(['C', i, j, typeIdx]);
      G.ui.toast('🚧 Works started: ' + type.name, 3500);
    }
    const cx = st.x + i * DP, cz = st.z + j * DP;
    list.sort((p, q) => p[1] - q[1] || Math.hypot(p[0] - cx, p[2] - cz) - Math.hypot(q[0] - cx, q[2] - cz));
    MetroBuild.jobs.push({ list, pics, i: 0, mine, name: type.name, total: list.length, icon: type.icon, done: 'New block ready: ' + type.name });
    return true;
  },
};

const CityPanel = {
  el: null, open: false, sel: null,

  show() {
    if (!City.plan()) { G.ui.toast('This board only works in ' + CITY); return; }
    this.open = true;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'cityPanel';
      this.el.className = 'overlay';
      document.body.append(this.el);
      this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    }
    this.sel = null;
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
    const st = City.plan(), el = this.el, p = G.player.pos;
    const pi = Math.round((p[0] - st.x) / DP), pj = Math.round((p[2] - st.z) / DP);
    const cells = [];
    let n = 0;
    for (let j = -CITY_RANGE; j <= CITY_RANGE; j++) for (let i = -CITY_RANGE; i <= CITY_RANGE; i++) {
      const b = City.built(i, j), c = !b && City.canBuild(i, j);
      if (b) n++;
      const s = this.sel && this.sel[0] === i && this.sel[1] === j;
      const mark = i === 0 && j === 0 ? '⛲' : i === 0 && j === -1 ? '🏫' : i === -1 && j === 0 ? '⚽' : i === 1 && j === 0 ? '🏦' : i === 0 && j === 1 ? '🌳' : b ? '▪' : c ? '+' : '';
      cells.push(`<button class="cp-cell${b ? ' built' : c ? ' free' : ''}${s ? ' sel' : ''}${i === pi && j === pj ? ' me' : ''}" data-i="${i}" data-j="${j}" ${b || !c ? 'disabled' : ''}>${mark}</button>`);
    }
    const side = this.sel ? `
      <div class="cp-side">
        <b>New block</b><span>${this.sel[0] > 0 ? 'East ' + this.sel[0] : this.sel[0] < 0 ? 'West ' + -this.sel[0] : ''} ${this.sel[1] > 0 ? 'South ' + this.sel[1] : this.sel[1] < 0 ? 'North ' + -this.sel[1] : ''}</span>
        ${CITY_TYPES.map((t, k) => `<button class="cp-type" data-k="${k}"><i>${t.icon}</i><div><b>${t.name}</b><span>${t.desc}${G.mode === 'survival' ? ' · 🪙 ' + (t.cost || CITY_COST) : ''}</span></div></button>`).join('')}
        <p>${G.mode === 'survival' ? 'You have 🪙 ' + (G.money | 0) : 'Free in creative'}</p>
      </div>` : `<div class="cp-side"><b>Grow the district</b><span>Pick a free square (+) next to the built blocks. Each block comes with its streets, pavements, trees and lamps, levelled with the rest of STUCOM.</span></div>`;
    el.innerHTML = `
      <div class="mp-card cp-card">
        <div class="mp-head"><i class="cp-logo">🏛️</i><div><b>${ED('Ajuntament de STUCOM · Urbanisme', CITY + ' City Hall · Planning')}</b><span>Town planning board · ${n} blocks built</span></div><button class="mp-x" data-a="close">✕</button></div>
        <div class="cp-body"><div class="cp-grid" style="grid-template-columns: repeat(${CITY_RANGE * 2 + 1}, 1fr)">${cells.join('')}</div>${side}</div>
      </div>`;
    el.querySelector('[data-a="close"]').addEventListener('click', () => this.close());
    el.querySelectorAll('.cp-cell.free').forEach((b) => b.addEventListener('click', () => { this.sel = [Number(b.dataset.i), Number(b.dataset.j)]; this.render(); }));
    el.querySelectorAll('.cp-type').forEach((b) => b.addEventListener('click', () => {
      const [i, j] = this.sel;
      if (City.start(i, j, Number(b.dataset.k), true)) this.close();
    }));
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.block && t.block.id === B.CITY_PANEL && !G.player.sneaking) { CityPanel.show(); this.swingHand(); return true; }
    return use.call(this, initial);
  };
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'C') { const [i, j, k] = [o[2], o[3], o[4]].map(Number); if ([i, j, k].every(Number.isInteger)) City.start(i, j, k, false); return; }
    return ap.call(this, r, o);
  };
  window.addEventListener('keydown', (e) => { if (CityPanel.open && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); CityPanel.close(); } }, true);
}

gen('city_panel_front', (d, rng, ctx) => fillTile(d, (x, y, k) => {
  const bezel = x < 3 || x > 28 || y < 3 || y > 28;
  if (bezel) { put(d, x, y, [52, 56, 64], (x === 0 || y === 0 ? 1.2 : 1) * (0.92 + rng() * 0.08)); return; }
  // a plan of blocks and streets
  const street = (x - 3) % 9 >= 7 || (y - 3) % 9 >= 7;
  let c = street ? [60, 64, 74] : (x + y) % 11 < 2 ? [90, 170, 90] : [226, 220, 204], e = 0.5;
  if (!street && x > 12 && x < 19 && y > 12 && y < 19) { c = [214, 40, 50]; e = 0.8; }
  put(d, x, y, c, 0.9 + rng() * 0.1);
  ctx.emit[k] = e;
}), { smooth: 0.7, bump: 0.3 });
shaped(B.CITY_PANEL, 1, ['III', 'IPI', 'IWI'], { I: I.IRON_INGOT, P: I.PAPER || B.PLANKS, W: B.WIRE });
