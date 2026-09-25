'use strict';
// HUD (hotbar, hearts, hunger, armour, air, overlays) and every container screen: survival
// inventory with 2x2 crafting and a recipe book, crafting table, furnace, chest and the
// creative item palette. Slot clicks follow the familiar pick-up / split / drag rules.

const iconCache = new Map();
function iconURL(id) {
  let u = iconCache.get(id);
  if (!u) { u = makeItemIcon(G.renderer.textureTiles, id, 64).toDataURL(); iconCache.set(id, u); }
  return u;
}

// 9x9 pixel sprites for the status bars
const HUD_SPRITES = {
  heart: ['.XX...XX.', 'XRRX.XRRX', 'XRWRXRRRX', 'XRRRRRRRX', 'XRRRRRRRX', '.XRRRRRX.', '..XRRRX..', '...XRX...', '....X....'],
  food: ['......XX.', '.....XBBX', '....XBBX.', '.XXXXBX..', 'XMMMMX...', 'XMWMMX...', 'XMMMMX...', 'XMMMX....', '.XXX.....'],
  armor: ['XXX...XXX', 'XAAXXXAAX', 'XAWAAAAAX', '.XAAAAAX.', '.XAAAAAX.', '.XAAAAAX.', '.XAAAAAX.', '.XXXXXXX.', '.........'],
  bubble: ['..XXXXX..', '.XWW...X.', 'XW.....BX', 'XW.....BX', 'X......BX', 'X.....BBX', '.X...BBX.', '..XXXXX..', '.........'],
};
const HUD_COLORS = {
  heart: { X: '#1b0606', R: '#e0292b', W: '#ffd0cc', E: 'rgba(40,20,20,0.55)' },
  food: { X: '#1e1007', M: '#c0692f', W: '#f4b27a', B: '#efe6d6', E: 'rgba(40,28,18,0.55)' },
  armor: { X: '#141719', A: '#c9d0d6', W: '#ffffff', E: 'rgba(30,34,38,0.55)' },
  bubble: { X: '#1d4f86', W: '#ffffff', B: '#5aa0e6', '.': 'rgba(150,200,255,0.25)' },
};
function hudIcon(kind, fill) {
  // fill: 2 full, 1 half, 0 empty
  const key = kind + fill;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 9;
  const ctx = cv.getContext('2d');
  const rows = HUD_SPRITES[kind], pal = HUD_COLORS[kind];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    let ch = rows[y][x];
    if (ch === '.' && kind !== 'bubble') continue;
    const inner = ch !== 'X' && ch !== '.';
    const cut = kind === 'food' ? x < 4 : x > 4;
    if (inner && (fill === 0 || (fill === 1 && cut))) ch = 'E';
    ctx.fillStyle = pal[ch] || pal.X;
    ctx.fillRect(x, y, 1, 1);
  }
  const u = cv.toDataURL();
  iconCache.set(key, u);
  return u;
}

const UI = {
  cursor: null,          // stack held by the mouse
  screen: null,          // current screen descriptor
  craft2: new Array(4).fill(null),
  craft3: new Array(9).fill(null),
  creativeTab: 'building', search: '', bookOpen: false,
  dirty: true, hudT: 0, lastHudKey: '', drag: null, hover: null, nameTimer: 0, toastTimer: 0,

  init() {
    this.buildHud();
    const cs = document.createElement('div');
    cs.id = 'cursorStack';
    document.body.append(cs);
    this.cursorEl = cs;
    const tip = document.createElement('div');
    tip.id = 'tooltip';
    document.body.append(tip);
    this.tipEl = tip;
    document.addEventListener('mousemove', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      if (this.screen) { this.cursorEl.style.transform = `translate(${e.clientX - 26}px, ${e.clientY - 26}px)`; this.placeTip(); }
    });
    document.addEventListener('mouseup', (e) => this.endDrag(e));
    $('screen').addEventListener('mousedown', (e) => {
      if (e.target === $('screen') && this.cursor) { this.dropStack(this.cursor, e.button === 2 ? 1 : this.cursor.count); this.render(); }
    });
    $('respawnBtn').addEventListener('click', () => { respawn(); requestLock(); });
    $('deathMenuBtn').addEventListener('click', () => { respawn(); showTitle(); });
  },

  // ------------------------------------------------------------------ HUD ----
  buildHud() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<i></i><span class="cnt"></span><b class="dur"><b></b></b>';
      hb.append(s);
    }
    for (const id of ['hearts', 'food', 'armorBar', 'air']) {
      const row = $(id);
      row.innerHTML = '';
      for (let i = 0; i < 10; i++) row.append(document.createElement('i'));
    }
  },

  fillSlot(el, s) {
    const i = el.firstChild, cnt = el.children[1], dur = el.children[2];
    const id = s ? s.id : 0;
    if (el._id !== id) { i.style.backgroundImage = id ? `url(${iconURL(id)})` : ''; el._id = id; }
    cnt.textContent = s && s.count > 1 ? s.count : '';
    const md = s ? maxDur(s.id) : 0;
    if (md && s.dmg > 0) {
      const f = 1 - s.dmg / md;
      dur.style.display = 'block';
      dur.firstChild.style.width = Math.round(f * 100) + '%';
      dur.firstChild.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    } else dur.style.display = 'none';
  },

  invDirty() { this.dirty = true; },

  updateHud(force) {
    const inv = G.inv, st = G.stats, p = G.player;
    if (this.dirty || force) {
      const slots = $('hotbar').children;
      for (let i = 0; i < 9; i++) {
        this.fillSlot(slots[i], inv.slots[i]);
        slots[i].classList.toggle('sel', i === inv.selected);
      }
      this.dirty = false;
      if (this.screen) this.render();
    }
    const survival = G.mode === 'survival';
    $('status').classList.toggle('hidden', !survival);
    if (!survival) return;
    const hp = Math.ceil(st.health), food = Math.ceil(st.food), arm = inv.armorPoints();
    const air = p.eyeInWater || st.air < 10 ? Math.ceil(st.air) : -1;
    const key = [hp, food, arm, air, st.hurtFlash > 0.5, st.health <= 4, st.healFlash > 0].join();
    if (key === this.lastHudKey && !force) return;
    this.lastHudKey = key;
    const set = (row, kind, v, show = true) => {
      row.classList.toggle('hidden', !show);
      for (let i = 0; i < 10; i++) {
        const f = v >= (i + 1) * 2 ? 2 : v === i * 2 + 1 ? 1 : 0;
        const k = kind === 'food' ? 9 - i : i;
        row.children[k].style.backgroundImage = `url(${hudIcon(kind, f)})`;
      }
    };
    set($('hearts'), 'heart', hp);
    set($('food'), 'food', food);
    set($('armorBar'), 'armor', arm, arm > 0);
    const airRow = $('air');
    airRow.classList.toggle('hidden', air < 0);
    if (air >= 0) for (let i = 0; i < 10; i++) {
      const k = 9 - i;
      airRow.children[k].style.backgroundImage = i < air ? `url(${hudIcon('bubble', 2)})` : '';
    }
    $('hearts').classList.toggle('low', st.health <= 4);
    $('hearts').classList.toggle('flash', st.hurtFlash > 0.5);
    $('hearts').classList.toggle('regen', st.healFlash > 0);
    $('food').classList.toggle('low', st.food <= 6 && st.sat <= 0);
  },

  selectSlot(i) {
    G.inv.selected = ((i % 9) + 9) % 9;
    this.invDirty();
    this.showName();
  },

  showName() {
    const el = $('blockname');
    const s = G.inv.held;
    el.textContent = s ? itemName(s.id) : '';
    el.classList.toggle('show', !!s);
    clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => el.classList.remove('show'), 1500);
  },

  toast(text, ms = 2200) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  },

  // Big title when arriving at a themed place.
  banner(icon, name) {
    const el = $('placeBanner');
    el.innerHTML = '';
    const i = document.createElement('span'); i.className = 'pb-icon'; i.textContent = icon;
    const t = document.createElement('span'); t.className = 'pb-name'; t.textContent = name;
    el.append(i, t);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    sfx('chime', null, 0.8, 1);
  },

  hurt() { this.lastHudKey = ''; },

  // per-frame overlays
  update(dt) {
    this.hudT += dt;
    if (this.hudT > 0.05 || this.dirty) { this.hudT = 0; this.updateHud(); }
    const st = G.stats, p = G.player;
    $('hurtOverlay').style.opacity = (st.hurtFlash * 0.55 + (G.mode === 'survival' && st.health <= 4 && !st.dead ? 0.18 + 0.1 * Math.sin(G.time * 4) : 0)).toFixed(3);
    const burning = G.mode === 'survival' && (st.fire > 0 || p.inLava) && !st.dead;
    $('fireOverlay').classList.toggle('on', burning);
    $('lavaOverlay').classList.toggle('on', p.eyeInLava);
    const sl = G.sleeping ? Math.min(1, G.sleeping.t / 1.4) * (G.sleeping.t > 2.2 ? Math.max(0, 1 - (G.sleeping.t - 2.2) / 0.4) : 1) : 0;
    $('sleepOverlay').style.opacity = sl.toFixed(3);
    if (this.screen && this.screen.kind === 'furnace') {
      this.furnaceT = (this.furnaceT || 0) + dt;
      if (this.furnaceT > 0.1) { this.furnaceT = 0; this.updateFurnaceBars(); }
    }
  },

  showDeath(msg) {
    this.closeScreen(true);
    $('deathMsg').textContent = msg;
    $('death').classList.remove('hidden');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    G.playing = false;
  },
  hideDeath() { $('death').classList.add('hidden'); },

  // -------------------------------------------------------------- screens ----
  open(screen) {
    if (G.stats.dead) return;
    this.screen = screen;
    G.screenOpen = true;
    document.body.classList.add('screen-open');
    releaseAllInput();
    $('screen').classList.remove('hidden');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    this.render();
  },
  openInventory() { this.open(G.mode === 'creative' ? { kind: 'creative' } : { kind: 'inventory' }); },
  openCrafting() { this.open({ kind: 'crafting' }); },
  openFurnace(x, y, z) { blockEntity(x, y, z, 'furnace'); this.open({ kind: 'furnace', key: posKey(x, y, z), pos: [x, y, z] }); },
  openChest(x, y, z) {
    blockEntity(x, y, z, 'chest');
    sfx('chest_open', [x + 0.5, y + 0.5, z + 0.5], 1, 1);
    this.open({ kind: 'chest', key: posKey(x, y, z), pos: [x, y, z] });
  },

  closeScreen(silent) {
    if (!this.screen) return;
    const s = this.screen;
    if (s.kind === 'chest') sfx('chest_close', [s.pos[0] + 0.5, s.pos[1] + 0.5, s.pos[2] + 0.5], 1, 1);
    for (const grid of [this.craft2, this.craft3]) {
      for (let i = 0; i < grid.length; i++) if (grid[i]) { this.giveBack(grid[i]); grid[i] = null; }
    }
    if (this.cursor) { this.giveBack(this.cursor); this.cursor = null; }
    this.screen = null;
    G.screenOpen = false;
    document.body.classList.remove('screen-open');
    this.hideTip();
    $('screen').classList.add('hidden');
    this.cursorEl.style.display = 'none';
    this.invDirty();
    if (!silent) requestLock();
  },

  giveBack(s) {
    const left = G.inv.add(s);
    if (left > 0) this.dropStack({ id: s.id, count: left, dmg: s.dmg }, left);
  },
  dropStack(s, n) {
    const p = G.player, e = p.eyePos(), d = p.lookDir();
    Ents.spawnItem({ id: s.id, count: n, dmg: s.dmg }, e[0] + d[0] * 0.4, e[1] - 0.3, e[2] + d[2] * 0.4, [d[0] * 4, 2, d[2] * 4], 1.5);
    if (s === this.cursor) { s.count -= n; if (s.count <= 0) this.cursor = null; }
  },
  dropCursor() { if (this.cursor) { this.dropStack(this.cursor, this.cursor.count); this.cursor = null; } },
  blockEntityRemoved(k) { if (this.screen && this.screen.key === k) this.closeScreen(false); },
  containerChanged(k) { if (this.screen && this.screen.key === k) this.render(); },

  // ---- slot model ----
  // A slot ref: { get, set, accept(stack), output, section }
  arrSlot(arr, i, section, accept) {
    return { get: () => arr[i], set: (s) => { arr[i] = s && s.count > 0 ? s : null; }, accept: accept || (() => true), section };
  },

  playerSlots() {
    const inv = G.inv;
    const main = [], hot = [];
    for (let i = 9; i < 36; i++) main.push(this.arrSlot(inv.slots, i, 'main'));
    for (let i = 0; i < 9; i++) hot.push(this.arrSlot(inv.slots, i, 'hotbar'));
    return { main, hot };
  },

  // ---- rendering ----
  render() {
    const s = this.screen;
    if (!s) return;
    const root = $('screenPanel');
    root.innerHTML = '';
    root.className = 'panel invpanel kind-' + s.kind;
    this.refs = [];
    const { main, hot } = this.playerSlots();
    this.sections = { main, hotbar: hot };
    if (s.kind === 'creative') this.renderCreative(root, hot);
    else {
      const top = document.createElement('div');
      top.className = 'invtop';
      root.append(top);
      if (s.kind === 'inventory') this.renderPlayerTop(top);
      else if (s.kind === 'crafting') this.renderCraftTop(top, this.craft3, 3, 'Crafting Table');
      else if (s.kind === 'furnace') this.renderFurnaceTop(top);
      else if (s.kind === 'chest') this.renderChestTop(top);
      else if (s.kind === 'arch') this.renderArchTop(top);
      root.append(this.label('Inventory'));
      root.append(this.grid(main, 9, 'main'));
      const hb = this.grid(hot, 9, 'hotbar');
      hb.classList.add('hotrow');
      root.append(hb);
    }
    this.renderCursor();
  },

  label(t) { const h = document.createElement('h3'); h.textContent = t; return h; },

  grid(refs, cols, cls) {
    const g = document.createElement('div');
    g.className = 'sgrid ' + (cls || '');
    g.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
    for (const r of refs) g.append(this.slotEl(r));
    return g;
  },

  slotEl(ref) {
    const el = document.createElement('div');
    el.className = 'slot' + (ref.output ? ' out' : '') + (ref.ghost ? ' ghost' : '');
    el.innerHTML = '<i></i><span class="cnt"></span><b class="dur"><b></b></b>';
    this.fillSlot(el, ref.get());
    if (ref.hint && !ref.get()) {
      const hintId = { helmet: I.ARMOR0, chest: I.ARMOR0 + 1, legs: I.ARMOR0 + 2, boots: I.ARMOR0 + 3, fuel: I.COAL }[ref.hint];
      el.classList.add('hint');
      el.firstChild.style.backgroundImage = `url(${iconURL(hintId)})`;
      el._id = -1;
    }
    el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.slotDown(ref, e); });
    el.addEventListener('mouseenter', () => { this.hover = ref; this.dragEnter(ref); this.showTip(ref); });
    el.addEventListener('mouseleave', () => { if (this.hover === ref) this.hover = null; this.hideTip(); });
    el.addEventListener('dblclick', (e) => { if (e.button === 0) this.collectAll(ref); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    ref.el = el;
    this.refs.push(ref);
    return el;
  },

  renderCursor() {
    const c = this.cursor;
    const el = this.cursorEl;
    if (!c) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = `<i style="background-image:url(${iconURL(c.id)})"></i><span class="cnt">${c.count > 1 ? c.count : ''}</span>`;
    if (this.mx !== undefined) el.style.transform = `translate(${this.mx - 26}px, ${this.my - 26}px)`;
  },

  // ---- tooltips ----
  showTip(ref) {
    const s = ref.tipStack ? ref.tipStack() : ref.get();
    if (!s || this.cursor) { this.hideTip(); return; }
    const d = ITEM_DEF[s.id];
    let html = `<b>${itemName(s.id)}</b>`;
    if (d && d.food) html += `<span>Restores ${d.food[0] / 2} hunger</span>`;
    if (d && d.damage && d.tool) html += `<span>${d.damage} attack damage</span>`;
    if (d && d.armor) html += `<span>+${d.armor.pts} armour</span>`;
    if (maxDur(s.id)) html += `<span>Durability ${maxDur(s.id) - (s.dmg || 0)} / ${maxDur(s.id)}</span>`;
    if (ref.recipe) html += `<span class="ing">${this.recipeText(ref.recipe)}</span>` + (ref.recipeNote ? `<span class="warn">${ref.recipeNote}</span>` : '');
    this.tipEl.innerHTML = html;
    this.tipEl.style.display = 'block';
    this.placeTip();
  },
  placeTip() {
    if (this.tipEl.style.display !== 'block') return;
    const w = this.tipEl.offsetWidth, h = this.tipEl.offsetHeight;
    let x = this.mx + 16, y = this.my - h - 8;
    if (x + w > innerWidth - 8) x = this.mx - w - 16;
    if (y < 8) y = this.my + 20;
    this.tipEl.style.transform = `translate(${x}px, ${y}px)`;
  },
  hideTip() { this.tipEl.style.display = 'none'; },
  recipeText(r) {
    const counts = new Map();
    const list = r.shaped ? r.cells.filter(Boolean) : r.ings;
    for (const ing of list) {
      const k = Array.isArray(ing) ? 'Any ' + (ing === TAG.planks ? 'planks' : ing === TAG.logs ? 'log' : ing === TAG.wool ? 'wool' : ing === TAG.coal ? 'coal' : ing === TAG.leaves ? 'leaves' : itemName(ing[0])) : itemName(ing);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts].map(([k, n]) => n + ' × ' + k).join(', ');
  },

  // ---- player inventory ----
  renderPlayerTop(top) {
    const inv = G.inv;
    const armor = document.createElement('div');
    armor.className = 'armorcol';
    ['helmet', 'chest', 'legs', 'boots'].forEach((k, i) => {
      const ref = this.arrSlot(inv.armor, i, 'armor', (s) => ITEM_DEF[s.id] && ITEM_DEF[s.id].armor && ITEM_DEF[s.id].armor.slot === i);
      ref.max = 1; ref.hint = k;
      armor.append(this.slotEl(ref));
    });
    const card = document.createElement('div');
    card.className = 'charcard';
    const st = G.stats;
    const day = Math.floor(G.time / DAY_LENGTH) + 1;
    card.innerHTML = `
      <div class="cc-title">Survivor</div>
      <div class="cc-row"><img src="${hudIcon('heart', 2)}"><span>${Math.ceil(st.health)} / 20</span></div>
      <div class="cc-row"><img src="${hudIcon('food', 2)}"><span>${Math.ceil(st.food)} / 20</span></div>
      <div class="cc-row"><img src="${hudIcon('armor', 2)}"><span>${inv.armorPoints()} armour</span></div>
      <div class="cc-foot">${formatClock(G.dayTime)} · ${['Peaceful', 'Easy', 'Normal', 'Hard'][G.difficulty]}</div>`;
    void day;
    top.append(armor, card);
    this.renderCraftTop(top, this.craft2, 2, 'Crafting');
    const bookBtn = document.createElement('button');
    bookBtn.className = 'bookbtn';
    bookBtn.textContent = this.bookOpen ? 'Hide recipes' : 'Recipe book';
    bookBtn.addEventListener('click', () => { this.bookOpen = !this.bookOpen; this.render(); });
    top.append(bookBtn);
  },

  renderCraftTop(top, grid, w, title) {
    const box = document.createElement('div');
    box.className = 'craftbox';
    box.append(this.label(title));
    const row = document.createElement('div');
    row.className = 'craftrow';
    const refs = grid.map((_, i) => this.arrSlot(grid, i, 'craft'));
    this.sections.craft = refs;
    row.append(this.grid(refs, w, 'craft'));
    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    row.append(arrow);
    const ids = grid.map((s) => (s ? s.id : 0));
    const r = matchRecipe(ids, w, w);
    const out = {
      output: true, section: 'result',
      get: () => (r ? mkStack(r.result, r.count) : null),
      set: () => {}, accept: () => false, craft: { grid, w, recipe: r },
    };
    row.append(this.slotEl(out));
    box.append(row);
    top.append(box);
    if (this.bookOpen || this.screen.kind === 'crafting') top.append(this.renderBook(w));
  },

  renderBook(w) {
    const book = document.createElement('div');
    book.className = 'book';
    const head = document.createElement('div');
    head.className = 'bookhead';
    head.innerHTML = '<h3>Recipes</h3>';
    const q = document.createElement('input');
    q.type = 'text'; q.placeholder = 'Search'; q.value = this.bookSearch || '';
    q.addEventListener('input', () => { this.bookSearch = q.value; const pos = q.selectionStart; this.render(); const nq = document.querySelector('.bookhead input'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } });
    head.append(q);
    book.append(head);
    const list = document.createElement('div');
    list.className = 'booklist';
    const have = new Map();
    for (const s of G.inv.slots) if (s) have.set(s.id, (have.get(s.id) || 0) + s.count);
    const canMake = (r) => {
      const need = new Map();
      const ings = r.shaped ? r.cells.filter(Boolean) : r.ings;
      const pool = new Map(have);
      for (const ing of ings) {
        const opts = Array.isArray(ing) ? ing : [ing];
        const id = opts.find((o) => (pool.get(o) || 0) > 0);
        if (id === undefined) return false;
        pool.set(id, pool.get(id) - 1);
        need.set(id, (need.get(id) || 0) + 1);
      }
      return true;
    };
    const term = (this.bookSearch || '').toLowerCase();
    const seen = new Set();
    const entries = [];
    for (const r of RECIPES) {
      if (term && !itemName(r.result).toLowerCase().includes(term)) continue;
      const key = r.result + ':' + (r.shaped ? r.cells.join() : r.ings.join());
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ r, ok: canMake(r), fits: recipeFits(r, w) });
    }
    entries.sort((a, b) => (b.ok && b.fits) - (a.ok && a.fits));
    for (const e of entries) {
      const ref = { get: () => mkStack(e.r.result, e.r.count), set: () => {}, accept: () => false, section: 'book', recipe: e.r };
      if (!e.fits) ref.recipeNote = 'Needs a crafting table';
      const el = this.slotEl(ref);
      el.classList.add('recipe');
      if (!e.ok || !e.fits) el.classList.add('dim');
      el.onmousedown = null;
      ref.bookClick = (shift) => { if (e.fits) this.fillRecipe(e.r, w, shift); };
      list.append(el);
    }
    book.append(list);
    return book;
  },

  fillRecipe(r, w, shift) {
    const grid = w === 2 ? this.craft2 : this.craft3;
    for (let i = 0; i < grid.length; i++) if (grid[i]) { this.giveBack(grid[i]); grid[i] = null; }
    const layout = recipeLayout(r, w);
    const times = shift ? 64 : 1;
    for (let t = 0; t < times; t++) {
      let ok = true;
      const taken = [];
      for (const { ing, slot } of layout) {
        const opts = Array.isArray(ing) ? ing : [ing];
        const id = opts.find((o) => G.inv.count(o) > 0 && (!grid[slot] || grid[slot].id === o));
        if (id === undefined || (grid[slot] && grid[slot].count >= maxStack(id))) { ok = false; break; }
        G.inv.remove(id, 1);
        taken.push([slot, id]);
        if (grid[slot]) grid[slot].count++; else grid[slot] = mkStack(id, 1);
      }
      if (!ok) {
        for (const [slot, id] of taken) { grid[slot].count--; if (grid[slot].count <= 0) grid[slot] = null; G.inv.add(mkStack(id, 1)); }
        break;
      }
    }
    sfx('click', null, 1, 1);
    this.invDirty();
    this.render();
  },

  // ---- furnace ----
  renderFurnaceTop(top) {
    const be = G.world.blockEntities.get(this.screen.key);
    if (!be) return;
    const box = document.createElement('div');
    box.className = 'furnacebox';
    box.append(this.label('Furnace'));
    const lay = document.createElement('div');
    lay.className = 'furnace';
    const inRef = this.arrSlot(be.slots, 0, 'fin');
    const fuelRef = this.arrSlot(be.slots, 1, 'ffuel', (s) => !!(ITEM_DEF[s.id] && ITEM_DEF[s.id].fuel));
    fuelRef.hint = 'fuel';
    const outRef = { get: () => be.slots[2], set: (s) => { be.slots[2] = s && s.count > 0 ? s : null; }, accept: () => false, section: 'fout', takeOnly: true };
    this.sections.fin = [inRef]; this.sections.ffuel = [fuelRef]; this.sections.fout = [outRef];
    const col = document.createElement('div');
    col.className = 'fcol';
    const flame = document.createElement('div');
    flame.className = 'flame';
    flame.innerHTML = '<div></div>';
    col.append(this.slotEl(inRef), flame, this.slotEl(fuelRef));
    const arrow = document.createElement('div');
    arrow.className = 'arrow progress';
    arrow.innerHTML = '<div></div>';
    lay.append(col, arrow, this.slotEl(outRef));
    box.append(lay);
    top.append(box);
    this.flameEl = flame.firstChild; this.arrowEl = arrow.firstChild;
    this.updateFurnaceBars();
  },
  updateFurnaceBars() {
    const s = this.screen;
    const be = s && G.world.blockEntities.get(s.key);
    if (!be || !this.flameEl) return;
    this.flameEl.style.height = (be.burnMax ? clamp(be.burn / be.burnMax, 0, 1) * 100 : 0) + '%';
    this.arrowEl.style.width = clamp(be.cook / SMELT_TIME, 0, 1) * 100 + '%';
    const sig = be.slots.map((x) => (x ? x.id + ':' + x.count : '-')).join();
    if (sig !== this.furnaceSig) { this.furnaceSig = sig; if (this.furnaceSigInit) this.render(); }
    this.furnaceSigInit = true;
  },

  renderChestTop(top) {
    const be = G.world.blockEntities.get(this.screen.key);
    if (!be) return;
    const box = document.createElement('div');
    box.className = 'chestbox';
    box.append(this.label('Chest'));
    const refs = be.slots.map((_, i) => this.arrSlot(be.slots, i, 'chest'));
    this.sections.chest = refs;
    box.append(this.grid(refs, 9, 'chest'));
    top.append(box);
  },

  // ---- architect's table: turn building blocks into stairs, roofs, panels, columns and arches ----
  renderArchTop(top) {
    const box = document.createElement('div');
    box.className = 'archbox';
    box.append(this.label("Architect's Table"));
    const creative = G.mode === 'creative';
    const mats = ARCH_MATS.map((m, i) => ({ m, i, have: G.inv.count(m.src) })).filter((e) => creative || e.have > 0);
    if (this.archMat === undefined || !mats.some((e) => e.i === this.archMat)) this.archMat = mats.length ? mats[0].i : -1;
    const row = document.createElement('div');
    row.className = 'archmats';
    for (const e of mats) {
      const b = document.createElement('button');
      b.className = 'archmat' + (e.i === this.archMat ? ' on' : '');
      b.title = e.m.name;
      b.innerHTML = `<i style="background-image:url(${iconURL(e.m.src)})"></i><span>${e.m.name}${creative ? '' : ' ×' + e.have}</span>`;
      b.addEventListener('click', () => { this.archMat = e.i; sfx('click', null, 1, 1.1); this.render(); });
      row.append(b);
    }
    box.append(row);
    if (this.archMat < 0) {
      const p = document.createElement('p');
      p.className = 'archhint';
      p.textContent = 'Bring planks, stone, bricks, sandstone, plaster, marble, roof tiles, slate or thatch to shape them.';
      box.append(p);
    } else {
      const m = ARCH_MATS[this.archMat];
      const refs = [];
      for (const s of SHAPE_KINDS) {
        const id = shapeId(m.key, s.key);
        if (!id) continue;
        refs.push({ get: () => mkStack(id, s.yield), set: () => {}, accept: () => false, section: 'arch', bookClick: (shift) => this.archMake(m, id, s.yield, shift) });
      }
      box.append(this.grid(refs, refs.length, 'archshapes'));
      const p = document.createElement('p');
      p.className = 'archhint';
      p.textContent = 'Click a shape: 1 ' + m.name.toLowerCase() + ' block each. Shift-click makes up to 16. Roofs point away from you; aim at a ceiling or the top half of a wall to place them upside down.';
      box.append(p);
    }
    top.append(box);
  },

  archMake(m, id, yieldN, shift) {
    const creative = G.mode === 'creative';
    const n = creative ? (shift ? 16 : 1) : Math.min(shift ? 16 : 1, G.inv.count(m.src));
    if (n <= 0) return;
    if (!creative) G.inv.remove(m.src, n);
    const left = G.inv.add(mkStack(id, n * yieldN));
    if (left > 0) this.giveBack(mkStack(id, left));
    sfx('place_0', null, 0.6, 1.3);
    this.invDirty();
    this.render();
  },

  // ---- creative ----
  renderCreative(root, hot) {
    const tabs = document.createElement('div');
    tabs.className = 'ctabs';
    const all = [...CREATIVE_TABS, { key: 'search', name: 'Search' }, { key: 'inv', name: 'Inventory' }];
    for (const t of all) {
      const b = document.createElement('button');
      b.className = 'ctab' + (this.creativeTab === t.key ? ' on' : '');
      const iconId = { building: B.BRICKS, architecture: shapeId('tiles', 'slope'), nature: B.GRASS, functional: B.CRAFTING_TABLE, tools: I.TOOL0 + 20, combat: I.TOOL0 + 23, food: I.APPLE, materials: I.DIAMOND, transport: I.JET, search: I.BOOK, inv: B.CHEST }[t.key];
      b.innerHTML = `<i style="background-image:url(${iconURL(iconId)})"></i><span>${t.name}</span>`;
      b.addEventListener('click', () => { this.creativeTab = t.key; sfx('click', null, 1, 1); this.render(); });
      tabs.append(b);
    }
    root.append(tabs);
    if (this.creativeTab === 'inv') {
      const top = document.createElement('div');
      top.className = 'invtop';
      const armor = document.createElement('div');
      armor.className = 'armorcol';
      ['helmet', 'chest', 'legs', 'boots'].forEach((k, i) => {
        const ref = this.arrSlot(G.inv.armor, i, 'armor', (s) => ITEM_DEF[s.id] && ITEM_DEF[s.id].armor && ITEM_DEF[s.id].armor.slot === i);
        ref.max = 1; ref.hint = k;
        armor.append(this.slotEl(ref));
      });
      top.append(armor);
      root.append(top);
      root.append(this.label('Inventory'));
      root.append(this.grid(this.sections.main, 9, 'main'));
    } else {
      const head = document.createElement('div');
      head.className = 'chead';
      const q = document.createElement('input');
      q.type = 'text'; q.placeholder = 'Search items…'; q.value = this.search;
      q.addEventListener('input', () => { this.search = q.value; this.creativeTab = 'search'; this.renderCreativeGrid(); });
      q.addEventListener('focus', () => { if (this.creativeTab !== 'search') { this.creativeTab = 'search'; this.render(); const nq = document.querySelector('.chead input'); if (nq) nq.focus(); } });
      head.append(q);
      const clear = document.createElement('button');
      clear.textContent = 'Clear hotbar';
      clear.addEventListener('click', () => { for (let i = 0; i < 9; i++) G.inv.slots[i] = null; this.invDirty(); this.render(); });
      head.append(clear);
      root.append(head);
      const pal = document.createElement('div');
      pal.className = 'palette';
      root.append(pal);
      this.paletteEl = pal;
      this.renderCreativeGrid();
    }
    const bottom = document.createElement('div');
    bottom.className = 'cbottom';
    const hb = this.grid(hot, 9, 'hotbar');
    hb.classList.add('hotrow');
    const trash = { get: () => null, set: () => {}, accept: () => true, section: 'trash', trash: true };
    const tEl = this.slotEl(trash);
    tEl.classList.add('trash');
    tEl.title = 'Destroy item (Shift-click: clear inventory)';
    bottom.append(hb, tEl);
    root.append(bottom);
  },

  renderCreativeGrid() {
    const pal = this.paletteEl;
    if (!pal) return;
    pal.innerHTML = '';
    let ids;
    if (this.creativeTab === 'search') {
      const t = this.search.trim().toLowerCase();
      ids = creativeItems('all').filter((id) => !t || itemName(id).toLowerCase().includes(t));
    } else ids = creativeItems(this.creativeTab);
    const g = document.createElement('div');
    g.className = 'sgrid';
    g.style.gridTemplateColumns = 'repeat(auto-fill, var(--slot))';
    for (const id of ids) {
      const ref = { get: () => mkStack(id, 1), set: () => {}, accept: () => true, section: 'palette', infinite: id };
      g.append(this.slotEl(ref));
    }
    pal.append(g);
  },

  // ----------------------------------------------------------- slot clicks ----
  slotDown(ref, e) {
    const shift = e.shiftKey;
    const btn = e.button;
    this.hideTip();
    if (ref.bookClick) { ref.bookClick(shift); return; }
    if (ref.trash) {
      if (shift) { G.inv.clear(); }
      this.cursor = null;
      this.invDirty(); this.render();
      return;
    }
    if (ref.infinite) {
      const id = ref.infinite;
      if (shift) {
        const s = mkStack(id, maxStack(id));
        const empty = G.inv.slots.findIndex((x, i) => i < 9 && !x);
        G.inv.slots[empty >= 0 ? empty : G.inv.selected] = s;
      } else if (this.cursor && this.cursor.id === id && btn === 2) {
        if (this.cursor.count < maxStack(id)) this.cursor.count++;
      } else if (this.cursor) this.cursor = null;
      else this.cursor = mkStack(id, btn === 2 ? 1 : maxStack(id));
      this.invDirty(); this.render();
      return;
    }
    if (ref.output) { this.takeCraft(ref, shift); return; }
    if (shift && btn === 0) { this.quickMove(ref); return; }
    const s = ref.get();
    if (!this.cursor) {
      if (!s) return;
      if (btn === 2) {
        const half = Math.ceil(s.count / 2);
        this.cursor = { id: s.id, count: half, dmg: s.dmg };
        s.count -= half;
        ref.set(s.count > 0 ? s : null);
      } else { this.cursor = s; ref.set(null); }
      this.after(ref);
      return;
    }
    if (ref.takeOnly) {
      if (s && sameItem(s, this.cursor) && this.cursor.count + s.count <= maxStack(s.id)) { this.cursor.count += s.count; ref.set(null); this.after(ref); }
      return;
    }
    // with a stack on the cursor: start a drag; a single-slot drag acts as a click on release
    this.drag = { btn, refs: [ref], start: this.cursor.count };
  },

  dragEnter(ref) {
    const d = this.drag;
    if (!d || ref.output || ref.infinite || ref.takeOnly || ref.trash || ref.bookClick) return;
    if (d.refs.includes(ref)) return;
    const s = ref.get();
    if (s && !sameItem(s, this.cursor)) return;
    if (!ref.accept(this.cursor)) return;
    d.refs.push(ref);
    ref.el && ref.el.classList.add('dragging');
  },

  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!this.cursor) { this.render(); return; }
    if (d.refs.length === 1) { this.clickWithCursor(d.refs[0], d.btn); return; }
    const c = this.cursor;
    const per = d.btn === 2 ? 1 : Math.max(1, Math.floor(c.count / d.refs.length));
    for (const ref of d.refs) {
      if (c.count <= 0) break;
      const s = ref.get();
      const max = Math.min(ref.max || 64, maxStack(c.id));
      const have = s ? s.count : 0;
      const n = Math.min(per, c.count, max - have);
      if (n <= 0) continue;
      ref.set(s ? (s.count += n, s) : { id: c.id, count: n, dmg: c.dmg });
      c.count -= n;
    }
    if (c.count <= 0) this.cursor = null;
    this.after(null);
  },

  clickWithCursor(ref, btn) {
    const s = ref.get(), c = this.cursor;
    if (!ref.accept(c)) {
      if (s && !c) return;
      return;
    }
    const max = Math.min(ref.max || 64, maxStack(c.id));
    if (!s) {
      const n = btn === 2 ? 1 : Math.min(c.count, max);
      ref.set({ id: c.id, count: n, dmg: c.dmg });
      c.count -= n;
    } else if (sameItem(s, c)) {
      const n = Math.min(btn === 2 ? 1 : c.count, max - s.count);
      s.count += n; c.count -= n;
      ref.set(s);
    } else if (c.count <= max) {
      ref.set(c); this.cursor = s;
      this.after(ref);
      return;
    }
    if (c.count <= 0) this.cursor = null;
    this.after(ref);
  },

  after() {
    this.invDirty();
    this.render();
    if (this.hover) this.showTip(this.hover);
  },

  takeCraft(ref, shift) {
    const cr = ref.craft;
    if (!cr || !cr.recipe) return;
    const r = cr.recipe;
    const consume = () => {
      for (let i = 0; i < cr.grid.length; i++) {
        const g = cr.grid[i];
        if (!g) continue;
        g.count--;
        if (g.count <= 0) cr.grid[i] = null;
      }
    };
    if (shift) {
      let made = 0;
      while (made < 64) {
        const ids = cr.grid.map((s) => (s ? s.id : 0));
        const rr = matchRecipe(ids, cr.w, cr.w);
        if (rr !== r) break;
        const left = G.inv.add(mkStack(r.result, r.count));
        if (left > 0) { if (left < r.count) consume(); this.dropStack(mkStack(r.result, left), left); break; }
        consume();
        made++;
      }
    } else {
      if (this.cursor && (this.cursor.id !== r.result || this.cursor.count + r.count > maxStack(r.result))) return;
      if (this.cursor) this.cursor.count += r.count; else this.cursor = mkStack(r.result, r.count);
      consume();
    }
    sfx('click', null, 0.8, 1.2);
    this.after(ref);
  },

  quickMove(ref) {
    const s = ref.get();
    if (!s) return;
    const sec = ref.section, S = this.sections;
    let targets = [];
    const kind = this.screen.kind;
    const d = ITEM_DEF[s.id];
    if (sec === 'hotbar' || sec === 'main') {
      if (kind === 'chest') targets = [S.chest];
      else if (kind === 'furnace') targets = SMELT[s.id] !== undefined ? [S.fin] : d && d.fuel ? [S.ffuel] : [];
      if (d && d.armor && (kind === 'inventory' || kind === 'creative')) {
        const i = d.armor.slot;
        if (!G.inv.armor[i]) { G.inv.armor[i] = s; ref.set(null); this.after(ref); return; }
      }
      if (!targets.length || targets.every((t) => !t)) targets = [sec === 'hotbar' ? S.main : S.hotbar];
    } else targets = [S.hotbar, S.main];
    targets = targets.filter(Boolean);
    let left = s.count;
    for (const list of targets) {
      for (const t of list) {
        if (left <= 0) break;
        const ts = t.get();
        if (ts && sameItem(ts, s) && t.accept(s)) {
          const n = Math.min(left, Math.min(t.max || 64, maxStack(s.id)) - ts.count);
          if (n > 0) { ts.count += n; left -= n; t.set(ts); }
        }
      }
      for (const t of list) {
        if (left <= 0) break;
        if (!t.get() && t.accept(s)) {
          const n = Math.min(left, Math.min(t.max || 64, maxStack(s.id)));
          t.set({ id: s.id, count: n, dmg: s.dmg }); left -= n;
        }
      }
    }
    s.count = left;
    ref.set(left > 0 ? s : null);
    this.after(ref);
  },

  collectAll(ref) {
    const c = this.cursor;
    if (!c) return;
    const max = maxStack(c.id);
    for (const r of this.refs) {
      if (c.count >= max) break;
      if (r.output || r.infinite || r.bookClick || r === ref) continue;
      const s = r.get();
      if (s && sameItem(s, c)) {
        const n = Math.min(s.count, max - c.count);
        c.count += n; s.count -= n;
        r.set(s.count > 0 ? s : null);
      }
    }
    this.after(ref);
  },

  // keyboard while a screen is open (number keys swap with the hotbar, Q drops)
  key(e) {
    const ref = this.hover;
    if (!ref || ref.output || ref.infinite || ref.bookClick || ref.trash) return false;
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5)) - 1;
      if (n < 0 || n > 8) return false;
      const a = ref.get(), b = G.inv.slots[n];
      if (b && !ref.accept(b)) return true;
      ref.set(b); G.inv.slots[n] = a;
      this.after(ref);
      return true;
    }
    if (e.code === 'KeyQ') {
      const s = ref.get();
      if (!s) return true;
      const n = e.ctrlKey ? s.count : 1;
      this.dropStack({ id: s.id, count: n, dmg: s.dmg }, n);
      s.count -= n;
      ref.set(s.count > 0 ? s : null);
      this.after(ref);
      return true;
    }
    return false;
  },
};
