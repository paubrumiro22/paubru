'use strict';
// Maps. Every loaded chunk is painted once into a 16x16 tile from the top block of each column
// (texture average x biome tint, water by depth and its own colour, relief shading) and painted
// again when its mesh changes. Tiles go into 256x256 region canvases (MapStore), which both the
// corner minimap and the full-screen world map (M) draw from, so everything you have explored
// stays on the map. A 8x8 copy of each tile is saved per world, markers and death points in the
// world save.

const MINIMAP_CSS = 176;
const REGION_CHUNKS = 16;                 // chunks per region canvas side
const MAP_KEY = 'blocklands.map.';

function mapColors() {
  const tiles = G.renderer.textureTiles;
  const out = new Float32Array(MAX_BLOCK * 3);
  for (let id = 1; id < MAX_BLOCK; id++) {
    if (BLOCK_NAME[id] === undefined) continue;
    const px = tiles[BLOCK_TEX[id * 6 + 2]];
    if (!px) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 100) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    if (n) { out[id * 3] = r / n; out[id * 3 + 1] = g / n; out[id * 3 + 2] = b / n; }
  }
  return out;
}

// ---- store of explored terrain ----
const MapStore = {
  key: null, seed: null, regions: new Map(), small: new Map(), painted: new WeakMap(), dirty: false, colors: null,

  // A world was loaded: switch to its map (a new seed on the same slot starts a blank one).
  reset(key, seed) {
    this.key = key; this.seed = seed;
    this.regions.clear(); this.small.clear(); this.painted = new WeakMap(); this.dirty = false;
    const saved = storageGet(MAP_KEY + key);
    if (!saved || saved.seed !== seed || typeof saved.c !== 'object') return;
    for (const [k, b64] of Object.entries(saved.c)) {
      try {
        const bin = atob(b64), a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        if (a.length !== 192) continue;
        const key2 = Number(k), cx = Math.floor(key2 / 65536) - 32768, cz = (key2 % 65536) - 32768;
        this.small.set(key2, a);
        const img = new ImageData(CS, CS);
        for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
          const s = ((z >> 1) * 8 + (x >> 1)) * 3, o = (z * CS + x) * 4;
          img.data[o] = a[s]; img.data[o + 1] = a[s + 1]; img.data[o + 2] = a[s + 2]; img.data[o + 3] = 255;
        }
        this.put(cx, cz, img);
      } catch (e) { /* skip damaged tiles */ }
    }
  },

  save() {
    if (!this.key || !this.dirty) return;
    this.dirty = false;
    const c = {};
    let n = 0;
    for (const [k, a] of this.small) {
      if (++n > 9000) break;   // about 3 MB at most
      let s = '';
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      c[k] = btoa(s);
    }
    storageSet(MAP_KEY + this.key, { seed: this.seed, c });
  },

  region(rx, rz, create) {
    const k = (rx + 4096) * 8192 + (rz + 4096);
    let r = this.regions.get(k);
    if (!r && create) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = REGION_CHUNKS * CS;
      r = { cv, ctx: cv.getContext('2d'), rx, rz };
      this.regions.set(k, r);
    }
    return r;
  },

  put(cx, cz, img) {
    const rx = Math.floor(cx / REGION_CHUNKS), rz = Math.floor(cz / REGION_CHUNKS);
    const r = this.region(rx, rz, true);
    r.ctx.putImageData(img, (cx - rx * REGION_CHUNKS) * CS, (cz - rz * REGION_CHUNKS) * CS);
  },

  explored(x, z) { return this.small.has(chunkKey(Math.floor(x) >> 4, Math.floor(z) >> 4)); },

  paint(c) {
    const col = this.colors || (this.colors = mapColors());
    const img = new ImageData(CS, CS);
    const d = img.data, blocks = c.blocks;
    const top = Math.min(CH - 1, (c.maxY | 0) + 1);
    const hts = new Int16Array(CS * CS);
    // the Nether and the Deep Dark have a rock ceiling: map the floor of the caves under it
    const dim = G.world.gen.type === 'default' ? dimAt(c.cx * CS + 8, c.cz * CS + 8) : DIM_OVER;
    const roofed = dim === DIM_NETHER || dim === DIM_DEEP;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let id = 0, y = top, wy = -1;
      if (roofed) {
        y = Math.min(top, dim === DIM_NETHER ? 118 : CH - 2);
        while (y > 0 && blocks[(y * CS + z) * CS + x]) y--;               // through the roof
        while (y > 0 && !blocks[(y * CS + z) * CS + x]) y--;              // down the open cave
        if (dim === DIM_NETHER && y > 90) {                                 // a thin upper pocket: look lower
          while (y > 0 && blocks[(y * CS + z) * CS + x]) y--;
          while (y > 0 && !blocks[(y * CS + z) * CS + x]) y--;
        }
      }
      for (; y >= 0; y--) {
        const b = blocks[(y * CS + z) * CS + x];
        if (!b) continue;
        const rt = BLOCK_RT[b];
        if (rt === RT_NONE || rt === RT_CROSS || rt === RT_TORCH || rt === RT_WALL_TORCH || rt === RT_LADDER) continue;
        if (b === B.WATER) { if (wy < 0) wy = y; if (wy - y < 12) continue; }
        id = b;
        break;
      }
      const i = z * CS + x, o = i * 4;
      const h = wy >= 0 ? wy : Math.max(0, y);
      hts[i] = h;
      let r = col[id * 3], g = col[id * 3 + 1], bl = col[id * 3 + 2];
      const tt = BLOCK_TINT[id];
      if (tt === TINT_GRASS || tt === TINT_FOLIAGE) {
        const t = tt === TINT_GRASS ? c.grassTint : c.foliageTint;
        r *= t[i * 3] / 200; g *= t[i * 3 + 1] / 200; bl *= t[i * 3 + 2] / 200;
      }
      let s = 1;
      if (wy < 0) {
        const hn = z > 0 ? hts[i - CS] : h, hw = x > 0 ? hts[i - 1] : h;
        s = 1 + clamp((h - hn) * 0.07 + (h - hw) * 0.05, -0.28, 0.22);
      } else {
        const a = clamp(0.5 + (wy - y) * 0.05, 0.5, 0.9);
        const wt = c.waterTint;
        const wr = wt ? wt[i * 4] * 1.6 + 20 : 38, wg = wt ? wt[i * 4 + 1] * 1.2 + 30 : 92, wb = wt ? wt[i * 4 + 2] * 1.2 + 60 : 190;
        r = r * 0.6 * (1 - a) + wr * a; g = g * 0.6 * (1 - a) + wg * a; bl = bl * 0.6 * (1 - a) + wb * a;
      }
      if (id === 0) { r = 18; g = 22; bl = 30; }
      d[o] = r * s; d[o + 1] = g * s; d[o + 2] = bl * s; d[o + 3] = 255;
    }
    this.put(c.cx, c.cz, img);
    // 8x8 copy for the save
    const a = new Uint8Array(192);
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) for (let k = 0; k < 3; k++) {
      const p = (zz, xx) => d[((z * 2 + zz) * CS + x * 2 + xx) * 4 + k];
      a[(z * 8 + x) * 3 + k] = (p(0, 0) + p(0, 1) + p(1, 0) + p(1, 1)) >> 2;
    }
    this.small.set(chunkKey(c.cx, c.cz), a);
    this.dirty = true;
  },

  // paint changed or new chunks, nearest first, a few per frame
  update() {
    const w = G.world;
    if (!w || !G.renderer) return;
    const p = G.vehicle ? G.vehicle.pos : G.player.pos;
    const pcx = Math.floor(p[0] / CS), pcz = Math.floor(p[2] / CS);
    let budget = 5;
    const R = 12;
    for (let d = 0; d <= R && budget > 0; d++) {
      for (let dz = -d; dz <= d && budget > 0; dz++) for (let dx = -d; dx <= d && budget > 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const c = w.getChunk(pcx + dx, pcz + dz);
        if (!c || !c.mesh) continue;
        if (this.painted.get(c) === c.uploads) continue;
        this.painted.set(c, c.uploads);
        this.paint(c);
        budget--;
      }
    }
  },

  // draw the explored map: world point (wx, wz) at canvas point (px, py), k pixels per block
  draw(ctx, wx, wz, px, py, k, W, H) {
    const bx0 = wx - px / k, bz0 = wz - py / k, bx1 = wx + (W - px) / k, bz1 = wz + (H - py) / k;
    const span = REGION_CHUNKS * CS;
    ctx.imageSmoothingEnabled = k < 1;
    for (let rx = Math.floor(bx0 / span); rx <= Math.floor(bx1 / span); rx++) for (let rz = Math.floor(bz0 / span); rz <= Math.floor(bz1 / span); rz++) {
      const r = this.region(rx, rz, false);
      if (!r) continue;
      ctx.drawImage(r.cv, px + (rx * span - wx) * k, py + (rz * span - wz) * k, span * k, span * k);
    }
  },
};

function mapKeyForWorld() {
  return G.slot ? 'slot.' + G.slot : Net.server ? 'srv.' + Net.server.code : G.online ? 'online' : 'main';
}

const STRUCT_ICONS = { village: '🏘️', castle: '🏰', mine: '⛏️', port: '⚓', watchtower: '🗼', ruins: '🏛️' };

// Things drawn on both maps: places, structures you have seen, markers, deaths, bed, players.
function drawMapMarks(ctx, wx, wz, px, py, k, W, H, dpr, full, clampRad) {
  const P = (x, z) => [px + (x - wx) * k, py + (z - wz) * k];
  const inside = ([sx, sz]) => sx > -20 && sz > -20 && sx < W + 20 && sz < H + 20;
  const pin = (x, z, margin) => {
    let [sx, sz] = P(x, z);
    if (clampRad) {
      const dx = sx - px, dz = sz - py, d = Math.hypot(dx, dz), lim = clampRad - margin;
      if (d > lim) { sx = px + dx * lim / d; sz = py + dz * lim / d; }
    }
    return [sx, sz];
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = Math.round((full ? 18 : 13) * dpr) + 'px system-ui, "Segoe UI Emoji", sans-serif';
  const g = G.world && G.world.gen;
  if (g) for (const r of g.regions) {
    const s = pin(r.x, r.z, 9 * dpr);
    if (!clampRad && !inside(s)) continue;
    ctx.fillText(r.p.icon, s[0], s[1]);
    if (full) { label(ctx, r.p.name, s[0], s[1] + 16 * dpr, dpr); }
  }
  if (g && g.structs && full) {
    const bx0 = wx - px / k, bz0 = wz - py / k, bx1 = wx + (W - px) / k, bz1 = wz + (H - py) / k;
    for (const p of structuresIn(g, bx0, bz0, bx1, bz1)) {
      if (!MapStore.explored(p.x, p.z)) continue;
      const s = P(p.x, p.z);
      if (!inside(s)) continue;
      ctx.fillText(STRUCT_ICONS[p.type] || '📍', s[0], s[1]);
      if (k > 0.3) label(ctx, p.name || (p.type[0].toUpperCase() + p.type.slice(1)), s[0], s[1] + 16 * dpr, dpr);
    }
  }
  if (G.spawnPoint) { const s = pin(G.spawnPoint[0], G.spawnPoint[2], 8 * dpr); if (clampRad || inside(s)) ctx.fillText('🛏️', s[0], s[1]); }
  for (const d of G.deaths || []) {
    const s = pin(d[0], d[2], 8 * dpr);
    if (!clampRad && !inside(s)) continue;
    ctx.fillText('💀', s[0], s[1]);
  }
  for (const m of G.markers || []) {
    const s = pin(m.x, m.z, 8 * dpr);
    if (!clampRad && !inside(s)) continue;
    drawPin(ctx, s[0], s[1], m.color || '#f2b94b', dpr * (full ? 1.2 : 0.9));
    if (full) label(ctx, m.name, s[0], s[1] - 22 * dpr, dpr);
  }
  if (Net.on) for (const r of Net.peers.values()) {
    const p = r.jet ? r.jet.pos : r.pos;
    const s = pin(p[0], p[2], 5 * dpr);
    ctx.beginPath(); ctx.arc(s[0], s[1], 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(' + NET_COLORS[r.color].join(',') + ')'; ctx.fill();
    ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (full) label(ctx, r.name, s[0], s[1] - 14 * dpr, dpr);
  }
}
function label(ctx, text, x, y, dpr) {
  ctx.save();
  ctx.font = '600 ' + Math.round(12 * dpr) + 'px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10 * dpr;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - w / 2, y - 9 * dpr, w, 18 * dpr);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y + 0.5 * dpr);
  ctx.restore();
}
function drawPin(ctx, x, y, color, s) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 9 * s, y - 10 * s, x - 7 * s, y - 20 * s, x, y - 20 * s);
  ctx.bezierCurveTo(x + 7 * s, y - 20 * s, x + 9 * s, y - 10 * s, x, y);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 1.5 * s; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - 13 * s, 3 * s, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}
function drawYou(ctx, x, y, yaw, dpr, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-yaw);
  const s = dpr * size;
  ctx.beginPath();
  ctx.moveTo(0, -7 * s); ctx.lineTo(5 * s, 6 * s); ctx.lineTo(0, 3 * s); ctx.lineTo(-5 * s, 6 * s); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5 * dpr;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---- corner minimap ----
const Minimap = {
  el: null, ctx: null, t: 0, shown: false,

  update(dt) {
    if (!this.el) { this.el = $('minimap'); this.ctx = this.el.getContext('2d'); }
    MapStore.update();
    const mode = G.settings.minimap;
    const show = mode !== 'off' && !G.onTitle && !G.hudHidden && !!G.world;
    if (show !== this.shown) { this.shown = show; this.el.classList.toggle('hidden', !show); $('mapCoords').classList.toggle('hidden', !show); document.body.classList.toggle('minimap', show); }
    if (!show) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 20;
    const src = G.vehicle ? G.vehicle.pos : G.player.pos;
    this.draw(src, G.vehicle ? G.vehicle.yaw : G.player.yaw, mode === 'large' ? 0.8 : 1.6);
  },

  draw(pos, yaw, scale) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.round(MINIMAP_CSS * dpr);
    const el = this.el, ctx = this.ctx;
    if (el.width !== S) { el.width = el.height = S; }
    const half = S / 2, rad = half - 2 * dpr, k = scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(half, half, rad, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#12161e'; ctx.fillRect(0, 0, S, S);
    MapStore.draw(ctx, pos[0], pos[2], half, half, k, S, S);
    drawMapMarks(ctx, pos[0], pos[2], half, half, k, S, S, dpr, false, rad);
    drawYou(ctx, half, half, yaw, dpr, 1);
    ctx.restore();
    ctx.beginPath(); ctx.arc(half, half, rad, 0, Math.PI * 2);
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    ctx.font = '700 ' + Math.round(11 * dpr) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(half, 9 * dpr, 7 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2b94b'; ctx.fillText('N', half, 9.5 * dpr);
    const txt = 'X ' + Math.floor(pos[0]) + '  Y ' + Math.floor(pos[1]) + '  Z ' + Math.floor(pos[2]);
    const mc = $('mapCoords');
    if (mc.textContent !== txt) mc.textContent = txt;
  },

  cycle() {
    const order = ['normal', 'large', 'off'];
    G.settings.minimap = order[(order.indexOf(G.settings.minimap) + 1) % order.length];
    saveSettings();
    UI.toast(G.settings.minimap === 'off' ? 'Minimap off' : G.settings.minimap === 'large' ? 'Minimap: zoomed out' : 'Minimap: close up');
  },
};

// ---- full-screen world map ----
const MARKER_COLORS = ['#f2b94b', '#e8504a', '#4aa3f2', '#5ad06a', '#c070e8', '#f07ab0'];
const WorldMap = {
  open: false, cx: 0, cz: 0, k: 2, drag: null, sel: null, cv: null, ctx: null,

  toggle() { if (this.open) this.close(); else this.show(); },

  show() {
    if (G.stats.dead || G.onTitle) return;
    this.open = true;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    const p = G.vehicle ? G.vehicle.pos : G.player.pos;
    this.cx = p[0]; this.cz = p[2];
    this.sel = null;
    $('worldMap').classList.remove('hidden');
    this.bind();
    this.draw();
    this.panel();
  },

  close() {
    if (!this.open) return;
    this.open = false;
    G.screenOpen = false;
    $('worldMap').classList.add('hidden');
    $('wmNameBox').classList.add('hidden');
    requestLock();
  },

  bind() {
    if (this.cv) return;
    this.cv = $('worldMapCanvas');
    this.ctx = this.cv.getContext('2d');
    const cv = this.cv;
    const toWorld = (e) => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
      return [this.cx + (sx - cv.width / 2) / (this.k * dpr), this.cz + (sy - cv.height / 2) / (this.k * dpr)];
    };
    cv.addEventListener('mousedown', (e) => { this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: 0 }; });
    window.addEventListener('mousemove', (e) => {
      const d = this.drag;
      if (!d || !this.open) return;
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
      this.cx = d.cx - (e.clientX - d.x) / this.k; this.cz = d.cz - (e.clientY - d.y) / this.k;
      this.draw();
    });
    window.addEventListener('mouseup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d || !this.open || d.moved > 4) return;
      const [wx, wz] = toWorld(e);
      // pick the nearest marker within reach, otherwise select this spot
      const reach = 12 / this.k;
      const m = (G.markers || []).find((q) => Math.hypot(q.x - wx, q.z - wz) < reach);
      this.sel = m ? { marker: m } : { x: wx, z: wz };
      this.draw();
      this.panel();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.25 : 0.8;
      const [wx, wz] = toWorld(e);
      const nk = clamp(this.k * f, 0.12, 8);
      // keep the point under the cursor in place
      this.cx = wx - (wx - this.cx) * this.k / nk; this.cz = wz - (wz - this.cz) * this.k / nk;
      this.k = nk;
      this.draw();
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.open) this.draw(); });
    $('wmClose').addEventListener('click', () => this.close());
    $('wmCenter').addEventListener('click', () => { const p = G.player.pos; this.cx = p[0]; this.cz = p[2]; this.draw(); });
    $('wmMarkHere').addEventListener('click', () => { const p = G.player.pos; this.sel = { x: p[0], z: p[2] }; this.askName(); });
    $('wmNameInput').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') this.addMarker($('wmNameInput').value);
      if (e.code === 'Escape') $('wmNameBox').classList.add('hidden');
    });
    $('wmNameOk').addEventListener('click', () => this.addMarker($('wmNameInput').value));
  },

  askName() {
    $('wmNameBox').classList.remove('hidden');
    const i = $('wmNameInput');
    i.value = 'Marker ' + ((G.markers || []).length + 1);
    setTimeout(() => { i.focus(); i.select(); }, 0);
  },

  addMarker(name) {
    const s = this.sel;
    if (!s || s.marker) return;
    G.markers = G.markers || [];
    const n = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Marker';
    const m = { x: Math.round(s.x), z: Math.round(s.z), name: n, color: MARKER_COLORS[G.markers.length % MARKER_COLORS.length] };
    G.markers.push(m);
    if (G.markers.length > 64) G.markers.shift();
    this.sel = { marker: m };
    $('wmNameBox').classList.add('hidden');
    saveWorld();
    sfx('click', null, 1, 1.2);
    this.draw();
    this.panel();
  },

  // side panel: what is selected and what you can do with it
  panel() {
    const box = $('wmSel');
    box.innerHTML = '';
    const s = this.sel;
    const btn = (text, fn, cls) => { const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.addEventListener('click', fn); box.append(b); };
    const info = document.createElement('div');
    info.className = 'wm-info';
    box.append(info);
    if (!s) { info.textContent = 'Click the map to pick a spot. Drag to move, scroll to zoom.'; return; }
    const x = s.marker ? s.marker.x : Math.round(s.x), z = s.marker ? s.marker.z : Math.round(s.z);
    const p = G.player.pos, dist = Math.round(Math.hypot(x - p[0], z - p[2]));
    info.textContent = (s.marker ? s.marker.name + ' · ' : '') + 'X ' + x + '  Z ' + z + ' · ' + dist + ' m away';
    if (s.marker) btn('Delete marker', () => { G.markers = G.markers.filter((m) => m !== s.marker); this.sel = null; saveWorld(); this.draw(); this.panel(); });
    else btn('Add a marker here', () => this.askName(), 'primary');
    if (G.mode === 'creative' && !Net.on) btn('Travel here', () => this.travel(x, z));
  },

  travel(x, z) {
    const p = G.player;
    prepareArea(x, z, 1);
    const h = G.world.surfaceHeight(x, z);
    p.pos = [x + 0.5, (h > 0 ? h : 90) + 1.2, z + 0.5];
    p.vel = [0, 0, 0];
    liftOutOfBlocks(p);
    Net.teleported();
    this.close();
  },

  draw() {
    const cv = this.cv, ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const k = this.k * dpr, px = W / 2, py = H / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e1219';
    ctx.fillRect(0, 0, W, H);
    MapStore.draw(ctx, this.cx, this.cz, px, py, k, W, H);
    // chunk grid when zoomed in
    if (this.k >= 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      const x0 = Math.floor((this.cx - px / k) / CS) * CS, z0 = Math.floor((this.cz - py / k) / CS) * CS;
      for (let x = x0; x < this.cx + px / k; x += CS) { const sx = px + (x - this.cx) * k; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
      for (let z = z0; z < this.cz + py / k; z += CS) { const sz = py + (z - this.cz) * k; ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(W, sz); ctx.stroke(); }
    }
    drawMapMarks(ctx, this.cx, this.cz, px, py, k, W, H, dpr, true, 0);
    const s = this.sel;
    if (s && !s.marker) {
      const sx = px + (s.x - this.cx) * k, sz = py + (s.z - this.cz) * k;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(sx, sz, 7 * dpr, 0, Math.PI * 2); ctx.stroke();
    }
    const p = G.vehicle ? G.vehicle.pos : G.player.pos;
    drawYou(ctx, px + (p[0] - this.cx) * k, py + (p[2] - this.cz) * k, G.vehicle ? G.vehicle.yaw : G.player.yaw, dpr, 1.5);
    // scale bar
    const meters = [10, 25, 50, 100, 250, 500, 1000].find((m) => m * this.k > 70) || 1000;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(16 * dpr, H - 38 * dpr, (meters * this.k + 20) * dpr, 26 * dpr);
    ctx.fillStyle = '#fff'; ctx.fillRect(26 * dpr, H - 22 * dpr, meters * k, 3 * dpr);
    ctx.font = '600 ' + Math.round(11 * dpr) + 'px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(meters + ' m', 26 * dpr, H - 26 * dpr);
  },
};
