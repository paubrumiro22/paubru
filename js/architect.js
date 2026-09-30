'use strict';
// Architect mode (K, or "Arquitecte" on a computer): the camera goes up and looks straight down
// on your surroundings like a floor plan, the mouse is free and you draw:
// - 🧱 Wall: drag a straight wall (height 1-6), 🏠 Room: drag a rectangle of walls with a floor,
//   🟫 Floor: drag an area of floor, 🚪 Door, 🪑 Furniture: click to place (R turns it),
//   🧽 Erase: drag an area, ⬚ Copy: drag an area to copy it, then 📋 Paste it anywhere (R turns it).
// - The working floor ("planta") goes up and down with PageUp / PageDown (or ▲ ▼); the grid shows it.
// - Ctrl+Z undoes, Ctrl+Y redoes. WASD or right-drag pans, the wheel zooms, Q / E turn the view.
// In survival it uses (and gives back) blocks from your inventory; plots and server rules apply.

const ARCHI_MATS = [B.PLASTER, B.BRICKS, B.STONE_BRICKS, B.PLANKS, B.DARK_OAK_PLANKS, B.SPRUCE_PLANKS, B.QUARTZ_BLOCK, B.CONCRETE, B.CONCRETE + 7, B.CONCRETE + 14, B.GLASS, B.GLASS_PANE, B.TERRAZZO, B.SANDSTONE, B.COBBLE].filter((id) => id !== undefined && ITEM_DEF[id]);
const ARCHI_FURN = [B.SOFA_GRAY, B.SOFA_RED, B.SOFA_BLUE, B.CHAIR, B.TABLE, B.COFFEE_TABLE, B.DOUBLE_BED, B.KITCHEN_COUNTER, B.KITCHEN_SINK, B.STOVE, B.FRIDGE, B.TV, B.FLOOR_LAMP,
  B.CEILING_LAMP, B.RUG_RED, B.RUG_BLUE, B.RUG_BEIGE, B.PAINTING_SEA, B.PAINTING_CITY, B.PAINTING_FLOWERS, B.PAINTING_ABSTRACT, B.WALL_SHELF, B.SHOWER, B.BATHTUB, B.TOILET, B.WASHER,
  B.DESKTOP_PC, B.GAME_CONSOLE, B.CHEST, B.BOOKSHELF, B.LANTERN, B.BUSH].filter((id) => id !== undefined && ITEM_DEF[id]);
const ARCHI_TOOLS = [['wall', '🧱', 'Wall'], ['room', '🏠', 'Room'], ['floor', '🟫', 'Floor'], ['door', '🚪', 'Door'], ['furn', '🪑', 'Furniture'], ['erase', '🧽', 'Erase'], ['copy', '⬚', 'Copy'], ['paste', '📋', 'Paste']];
const FACE4 = [5, 0, 4, 1];   // R turns: back towards north, east, south, west

const Architect = {
  on: false, tool: 'room', mat: B.PLASTER, furn: B.SOFA_GRAY, height: 3, rot: 0,
  cam: null, zoom: 26, view: 0, level: 0, drag: null, hover: null, clip: null, undo: [], redo: [], keys: new Set(),

  toggle() { if (this.on) this.close(); else this.open(); },
  open() {
    if (this.on || !G.playing || G.stats.dead || G.vehicle || Photo.on) return;
    if (G.screenOpen) GPanel.closeAll();
    this.on = true;
    const p = G.player;
    this.cam = [p.pos[0], p.pos[2]];
    this.level = Math.floor(p.pos[1] + 0.05);
    this.view = Math.round((-p.yaw) / (Math.PI / 2)) & 3;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    this.build();
    $('hud').classList.add('arch');
    sfx('click', null, 0.8, 1.2);
  },
  close() {
    if (!this.on) return;
    this.on = false;
    this.el.remove(); this.el = null;
    $('hud').classList.remove('arch');
    G.screenOpen = false;
    G.screenClosedAt = performance.now();
    requestLock();
  },

  camera(cam0, dt0) {
    const dt = Math.min(0.1, dt0 || 1 / 60), k = this.keys, a = this.view * Math.PI / 2;
    const fw = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), st = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sp = this.zoom * 0.9 * dt;
    // screen up is "forward" for the current view
    const f = [-Math.sin(a), -Math.cos(a)], r = [Math.cos(a), -Math.sin(a)];
    this.cam[0] += (f[0] * fw + r[0] * st) * sp; this.cam[1] += (f[1] * fw + r[1] * st) * sp;
    // keep near you: that is the part of the world that is loaded
    const p = G.player.pos, dx = this.cam[0] - p[0], dz = this.cam[1] - p[2], d = Math.hypot(dx, dz);
    if (d > 56) { this.cam[0] = p[0] + dx / d * 56; this.cam[1] = p[2] + dz / d * 56; }
    if (this.el) this.draw();
    return { pos: [this.cam[0], this.level + this.zoom, this.cam[1]], yaw: a, pitch: -Math.PI / 2, roll: 0, fov: 60 };
  },

  // ---- screen <-> world on the working plane ----
  toScreen(x, y, z) {
    const R = G.renderer, vp = R.viewProj, c = R.camPos, W = window.innerWidth, H = window.innerHeight;
    const rx = x - c[0], ry = y - c[1], rz = z - c[2];
    const w = vp[3] * rx + vp[7] * ry + vp[11] * rz + vp[15];
    if (w < 0.05) return null;
    return [((vp[0] * rx + vp[4] * ry + vp[8] * rz + vp[12]) / w * 0.5 + 0.5) * W, (1 - ((vp[1] * rx + vp[5] * ry + vp[9] * rz + vp[13]) / w * 0.5 + 0.5)) * H];
  },
  toCell(sx, sy) {
    const R = G.renderer, m = R.invViewProj, c = R.camPos;
    if (!m) return null;
    const nx = sx / window.innerWidth * 2 - 1, ny = 1 - sy / window.innerHeight * 2;
    const un = (z) => {
      const x = m[0] * nx + m[4] * ny + m[8] * z + m[12], y = m[1] * nx + m[5] * ny + m[9] * z + m[13], zz = m[2] * nx + m[6] * ny + m[10] * z + m[14], w = m[3] * nx + m[7] * ny + m[11] * z + m[15];
      return [x / w + c[0], y / w + c[1], zz / w + c[2]];
    };
    const a = un(-1), b = un(1), dy = b[1] - a[1];
    if (Math.abs(dy) < 1e-6) return null;
    const t = (this.level - a[1]) / dy;
    return [Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[2] + (b[2] - a[2]) * t)];
  },

  // ---- the plan of each tool: [[x, y, z, id, facing]] ----
  cells(a, b) {
    const L = this.level, H = this.height, out = [];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
    if (this.tool === 'wall') {
      const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
      if (alongX) for (let x = x0; x <= x1; x++) for (let y = L; y < L + H; y++) out.push([x, y, a[1], this.mat]);
      else for (let z = z0; z <= z1; z++) for (let y = L; y < L + H; y++) out.push([a[0], y, z, this.mat]);
    } else if (this.tool === 'room') {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        out.push([x, L - 1, z, edge ? this.mat : (this.mat === B.GLASS || this.mat === B.GLASS_PANE ? B.PLANKS : B.PLANKS)]);
        for (let y = L; y < L + H; y++) out.push([x, y, z, edge ? this.mat : B.AIR]);
      }
    } else if (this.tool === 'floor') {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push([x, L - 1, z, this.mat]);
    } else if (this.tool === 'erase') {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = L; y < L + H; y++) out.push([x, y, z, B.AIR]);
    }
    return out;
  },
  single(c) {
    const [x, z] = c, L = this.level, f = FACE4[this.rot];
    if (this.tool === 'door') {
      const f2 = FACE4[this.rot];
      return [[x, L, z, B.DOOR, f2], [x, L + 1, z, B.DOOR_TOP, f2]];
    }
    const id = this.furn;
    if (id === B.FRIDGE) return [[x, L, z, B.FRIDGE, f], [x, L + 1, z, B.FRIDGE_TOP, f]];
    if (id === B.SHOWER) return [[x, L, z, B.SHOWER, f], [x, L + 1, z, B.SHOWER_TOP, f]];
    if (id === B.DOUBLE_BED) {
      const fr = Furniture.front(f), side = furnSide(f), back = [-fr[0], -fr[2]];
      return [[x, L, z, B.DOUBLE_BED, f], [x + side[0], L, z + side[2], B.DOUBLE_BED, f | 8], [x + back[0], L, z + back[1], B.DOUBLE_BED_HEAD, f], [x + back[0] + side[0], L, z + back[1] + side[2], B.DOUBLE_BED_HEAD, f | 8]];
    }
    if (id === B.CEILING_LAMP) return [[x, L + this.height - 1, z, id, 0]];
    if (WALL_HUNG.has(id)) return [[x, L + 1, z, id, f]];
    return [[x, L, z, id, BLOCK_SHAPE[id] || FACING_BLOCKS.has(id) ? f : undefined]];
  },
  pasteCells(c) {
    const cl = this.clip;
    if (!cl) return [];
    const out = [], r = this.rot;
    for (const [dx, dy, dz, id, f] of cl.cells) {
      let x = dx, z = dz;
      for (let k = 0; k < r; k++) { const t = x; x = cl.d - 1 - z; z = t; }
      let ff = f;
      if (ff !== undefined && r) { const low = ff & 7, hi = ff & ~7; const order = [5, 0, 4, 1]; const i = order.indexOf(low); if (i >= 0) ff = order[(i + r) % 4] | hi; }
      out.push([c[0] + x, this.level - 1 + dy, c[1] + z, id, ff]);
    }
    return out;
  },

  // ---- doing it (with undo, inventory and permissions) ----
  apply(list, label) {
    const w = G.world, surv = G.mode === 'survival';
    const act = [];
    const need = new Map();
    for (const [x, y, z, id, f] of list) {
      if (y < 1 || y >= CH) continue;
      if (typeof Claims !== 'undefined' && !Claims.can(x, z, y)) { Claims.deny(x, z); return false; }
      const old = w.getBlock(x, y, z), of = w.getFacing(x, y, z);
      if (old === id && (f === undefined || of === f)) continue;
      if (old === B.BEDROCK) continue;
      act.push([x, y, z, old, of, id, f]);
      if (surv && id !== B.AIR) { const it = this.itemOf(id); if (it) need.set(it, (need.get(it) || 0) + 1); }
    }
    if (!act.length) return false;
    if (typeof Admin !== 'undefined' && Admin.on() && !Admin.canBuild(Net.owner)) { G.ui.toast('🔒 Only members can build on this server'); return false; }
    if (surv) {
      for (const [it, n] of need) if (G.inv.count(it) < n) { G.ui.toast('You need ' + n + '× ' + ITEM_DEF[it].name + ' (you have ' + G.inv.count(it) + ')'); sfx('gate_no', null, 0.6, 1); return false; }
      for (const [it, n] of need) G.inv.remove(it, n);
      for (const a of act) if (a[3] !== B.AIR && !IS_LIQUID(a[3])) { const it = this.itemOf(a[3]); if (it) G.inv.add(mkStack(it, 1)); }
      G.ui.invDirty();
    }
    editBlocks(act.map(([x, y, z, , , id, f]) => (f === undefined ? [x, y, z, id] : [x, y, z, id, f])));
    this.undo.push({ act, label });
    if (this.undo.length > 60) this.undo.shift();
    this.redo = [];
    sfx('place_' + (BLOCK_SOUND[act[0][5]] || BLOCK_SOUND[act[0][3]] || 1), null, 0.6, 1);
    return true;
  },
  itemOf(id) {
    if (id === B.DOUBLE_BED_HEAD) return null;
    if (id === B.FRIDGE_TOP || id === B.SHOWER_TOP || id === B.DOOR_TOP) return null;
    return ITEM_DEF[id] ? id : null;
  },
  step(back) {
    const from = back ? this.undo : this.redo, to = back ? this.redo : this.undo;
    const e = from.pop();
    if (!e) { G.ui.toast(back ? 'Nothing to undo' : 'Nothing to redo', 1200); return; }
    const surv = G.mode === 'survival';
    const list = e.act.map(([x, y, z, o, of, n, nf]) => (back ? [x, y, z, o, of] : [x, y, z, n, nf]));
    if (surv) {
      // what goes in has to come from the inventory, what comes out goes back into it
      const need = new Map();
      for (const a of e.act) { const inId = back ? a[3] : a[5]; const it = inId !== B.AIR && this.itemOf(inId); if (it) need.set(it, (need.get(it) || 0) + 1); }
      for (const [it, n] of need) if (G.inv.count(it) < n) { G.ui.toast('You need ' + n + '× ' + ITEM_DEF[it].name); from.push(e); return; }
      for (const [it, n] of need) G.inv.remove(it, n);
      for (const a of e.act) { const outId = back ? a[5] : a[3]; const it = outId !== B.AIR && this.itemOf(outId); if (it) G.inv.add(mkStack(it, 1)); }
      G.ui.invDirty();
    }
    editBlocks(list.map(([x, y, z, id, f]) => (f === undefined || f === 0 && !FACING_BLOCKS.has(id) ? [x, y, z, id] : [x, y, z, id, f])));
    to.push(e);
    G.ui.toast((back ? '↶ Undone: ' : '↷ Redone: ') + e.label, 1200);
  },
  copy(a, b) {
    const w = G.world, L = this.level;
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
    const cells = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = L - 1; y <= L + Math.max(this.height, 6); y++) {
      const id = w.getBlock(x, y, z);
      cells.push([x - x0, y - (L - 1), z - z0, id, FACING_BLOCKS.has(id) || BLOCK_SHAPE[id] ? w.getFacing(x, y, z) : undefined]);
    }
    const w0 = x1 - x0 + 1, d0 = z1 - z0 + 1;
    this.clip = { cells, w: w0, d: Math.max(w0, d0) };
    this.tool = 'paste';
    this.rot = 0;
    G.ui.toast('⬚ Copied ' + w0 + ' × ' + d0 + ' · click to paste, R turns it', 2500);
    this.build();
  },

  // ---- the interface ----
  build() {
    if (this.el) this.el.remove();
    const el = this.el = document.createElement('div');
    el.id = 'archUI';
    const e = GPanel.esc;
    const pal = this.tool === 'furn' ? ARCHI_FURN : ARCHI_MATS;
    const cur = this.tool === 'furn' ? this.furn : this.mat;
    el.innerHTML = `<canvas class="ar-c"></canvas>
      <div class="ar-bar">
        ${['door', 'erase', 'copy', 'paste'].includes(this.tool) ? '' : `<div class="ar-pal">${pal.map((id) => `<button data-m="${id}" class="${id === cur ? 'on' : ''}" title="${e(ITEM_DEF[id].name)}" style="background-image:url(${iconURL(id)})"></button>`).join('')}</div>`}
        <div class="ar-row">
          <div class="ar-tools">${ARCHI_TOOLS.map(([k, i, n]) => `<button data-t="${k}" class="${this.tool === k ? 'on' : ''}" title="${n}" ${k === 'paste' && !this.clip ? 'disabled' : ''}><i>${i}</i><span>${n}</span></button>`).join('')}</div>
          <div class="ar-opts">
            <label>Height <button data-h="-1">−</button><b>${this.height}</b><button data-h="1">＋</button></label>
            <label>Floor <button data-l="-1">▼</button><b>${this.level}</b><button data-l="1">▲</button></label>
            <button data-r title="R">⟳ ${['N', 'E', 'S', 'W'][this.rot]}</button>
            <button data-u title="Ctrl+Z">↶</button><button data-y title="Ctrl+Y">↷</button>
            <button class="ar-x" data-x>✓ Done</button>
          </div>
        </div>
      </div>
      <div class="ar-help">${G.mode === 'survival' ? '🎒 Uses blocks from your inventory · ' : ''}WASD / right-drag pan · wheel zoom · Q E turn view · PgUp PgDn floor · R turn · Esc exit</div>`;
    document.body.append(el);
    const c = el.querySelector('.ar-c');
    c.width = window.innerWidth; c.height = window.innerHeight;
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { this.tool = b.dataset.t; this.build(); }));
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { const id = Number(b.dataset.m); if (this.tool === 'furn') this.furn = id; else this.mat = id; this.build(); }));
    el.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { this.height = clamp(this.height + Number(b.dataset.h), 1, 8); this.build(); }));
    el.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { this.level = clamp(this.level + Number(b.dataset.l), 2, CH - 4); this.build(); }));
    el.querySelector('[data-r]').addEventListener('click', () => { this.rot = (this.rot + 1) & 3; this.build(); });
    el.querySelector('[data-u]').addEventListener('click', () => this.step(true));
    el.querySelector('[data-y]').addEventListener('click', () => this.step(false));
    el.querySelector('[data-x]').addEventListener('click', () => this.close());
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    c.addEventListener('pointerdown', (ev) => {
      const cell = this.toCell(ev.clientX, ev.clientY);
      if (ev.button === 2 || ev.button === 1) { this.pan = [ev.clientX, ev.clientY, this.cam[0], this.cam[1]]; c.setPointerCapture(ev.pointerId); return; }
      if (!cell) return;
      c.setPointerCapture(ev.pointerId);
      if (['furn', 'door'].includes(this.tool)) { this.apply(this.single(cell), ITEM_DEF[this.tool === 'door' ? B.DOOR : this.furn].name); return; }
      if (this.tool === 'paste') { if (this.apply(this.pasteCells(cell), 'paste')) G.ui.toast('📋 Pasted', 1000); return; }
      this.drag = { a: cell, b: cell };
    });
    c.addEventListener('pointermove', (ev) => {
      if (this.pan) {
        const [sx, sy, cx0, cz0] = this.pan, a = this.view * Math.PI / 2;
        const k = this.zoom / (window.innerHeight * 0.87);
        const dx = (ev.clientX - sx) * k, dy = (ev.clientY - sy) * k;
        this.cam[0] = cx0 - (Math.cos(a) * dx + Math.sin(a) * dy);
        this.cam[1] = cz0 - (-Math.sin(a) * dx + Math.cos(a) * dy);
        return;
      }
      this.hover = this.toCell(ev.clientX, ev.clientY);
      if (this.drag && this.hover) this.drag.b = this.hover;
    });
    c.addEventListener('pointerup', () => {
      this.pan = null;
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (this.tool === 'copy') { this.copy(d.a, d.b); return; }
      const list = this.cells(d.a, d.b);
      const lbl = { wall: 'wall', room: 'room', floor: 'floor', erase: 'erase' }[this.tool];
      this.apply(list, lbl);
    });
    c.addEventListener('wheel', (ev) => { ev.preventDefault(); this.zoom = clamp(this.zoom * (ev.deltaY > 0 ? 1.12 : 1 / 1.12), 8, 70); }, { passive: false });
  },
  draw() {
    const c = this.el.querySelector('.ar-c'), g = c.getContext('2d');
    if (c.width !== window.innerWidth || c.height !== window.innerHeight) { c.width = window.innerWidth; c.height = window.innerHeight; }
    g.clearRect(0, 0, c.width, c.height);
    const L = this.level;
    const quad = (x0, z0, x1, z1, y, fill, stroke) => {
      const pts = [[x0, z0], [x1 + 1, z0], [x1 + 1, z1 + 1], [x0, z1 + 1]].map(([x, z]) => this.toScreen(x, y, z));
      if (pts.some((q) => !q)) return;
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
    };
    // grid on the working floor round the centre of the view
    const cx = Math.floor(this.cam[0]), cz = Math.floor(this.cam[1]), R = Math.ceil(this.zoom * 1.1);
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
    for (let i = -R; i <= R; i++) {
      const a = this.toScreen(cx + i, L, cz - R), b = this.toScreen(cx + i, L, cz + R), c2 = this.toScreen(cx - R, L, cz + i), d = this.toScreen(cx + R, L, cz + i);
      if (a && b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      if (c2 && d) { g.beginPath(); g.moveTo(c2[0], c2[1]); g.lineTo(d[0], d[1]); g.stroke(); }
    }
    // you
    const me = this.toScreen(G.player.pos[0], G.player.pos[1], G.player.pos[2]);
    if (me) { g.fillStyle = '#ff9d2e'; g.beginPath(); g.arc(me[0], me[1], 6, 0, 7); g.fill(); }
    // what the tool would do
    const col = this.tool === 'erase' ? 'rgba(255,90,90,0.35)' : this.tool === 'copy' ? 'rgba(80,160,255,0.3)' : 'rgba(60,242,192,0.3)';
    const line = this.tool === 'erase' ? '#ff6b6b' : this.tool === 'copy' ? '#5aa8ff' : '#3cf2c0';
    if (this.drag) {
      const { a, b } = this.drag;
      if (this.tool === 'wall') {
        const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
        if (alongX) quad(Math.min(a[0], b[0]), a[1], Math.max(a[0], b[0]), a[1], L + this.height, col, line);
        else quad(a[0], Math.min(a[1], b[1]), a[0], Math.max(a[1], b[1]), L + this.height, col, line);
      } else quad(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), L + (this.tool === 'floor' ? 0 : this.height), col, line);
      const n = (Math.abs(b[0] - a[0]) + 1) + ' × ' + (Math.abs(b[1] - a[1]) + 1);
      const s = this.toScreen(b[0] + 1, L, b[1] + 1);
      if (s) { g.fillStyle = '#fff'; g.font = '800 14px system-ui'; g.fillText(n, s[0] + 8, s[1] + 16); }
    } else if (this.hover) {
      const h = this.hover;
      if (this.tool === 'paste' && this.clip) {
        const cells = this.pasteCells(h);
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const q of cells) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]); }
        quad(x0, z0, x1, z1, L, col, line);
      } else if (['furn', 'door'].includes(this.tool)) {
        for (const q of this.single(h)) quad(q[0], q[2], q[0], q[2], q[1] + 1, col, line);
        // the way it faces
        const f = FACE4[this.rot], fr = Furniture.front(f);
        const s0 = this.toScreen(h[0] + 0.5, L + 1, h[1] + 0.5), s1 = this.toScreen(h[0] + 0.5 + fr[0] * 0.9, L + 1, h[1] + 0.5 + fr[2] * 0.9);
        if (s0 && s1) { g.strokeStyle = '#ffd34d'; g.lineWidth = 3; g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke(); }
      } else quad(h[0], h[1], h[0], h[1], L, col, line);
    }
  },
};

// ---------------------------------------------------------------- hooks ----
{
  window.addEventListener('keydown', (e) => {
    if (!Architect.on) {
      if (e.code === 'KeyK' && !e.repeat && G.playing && !G.screenOpen && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) { e.preventDefault(); Architect.open(); }
      return;
    }
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const A = Architect;
    if (e.code === 'Escape' || e.code === 'KeyK') { A.close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { A.step(!e.shiftKey); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { A.step(false); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') { A.tool = 'copy'; A.build(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') { if (A.clip) { A.tool = 'paste'; A.build(); } return; }
    if (e.code === 'KeyR') { A.rot = (A.rot + 1) & 3; A.build(); return; }
    if (e.code === 'KeyQ') { A.view = (A.view + 1) & 3; return; }
    if (e.code === 'KeyE') { A.view = (A.view + 3) & 3; return; }
    if (e.code === 'PageUp') { A.level = Math.min(CH - 4, A.level + 1); A.build(); return; }
    if (e.code === 'PageDown') { A.level = Math.max(2, A.level - 1); A.build(); return; }
    const n = /^Digit([1-8])$/.exec(e.code);
    if (n) { A.tool = ARCHI_TOOLS[Number(n[1]) - 1][0]; A.build(); return; }
    A.keys.add(e.code);
  }, true);
  window.addEventListener('keyup', (e) => { Architect.keys.delete(e.code); });
  window.addEventListener('blur', () => Architect.keys.clear());
  PC.add({ key: 'architect', icon: '📐', name: ED('Arquitecte', 'Architect'), closes: true, run() { setTimeout(() => Architect.open(), 50); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/(architect|arquitecte)\b/i.test(text)) { setTimeout(() => Architect.open(), 50); return; } return run.call(this, text); };
}
