'use strict';
// Minimap in the top-right corner: a top-down view of the loaded world (north up) with you, the
// other players and the themed places. Every chunk is painted once into a 16Ã—16 tile from the top
// block of each column (texture average Ã— biome tint, water tinted by depth, a little relief
// shading) and painted again only when its mesh changes. Tiles are stitched into an offscreen
// canvas around the player, re-stitched only when you walk into another chunk.

const MINIMAP_R = 7;      // chunks kept around the player in the offscreen map
const MINIMAP_CSS = 176;  // on-screen size in CSS pixels

const Minimap = {
  el: null, ctx: null, off: null, octx: null, colors: null,
  tiles: new WeakMap(), center: null, world: null, offsets: null, t: 0, shown: false,

  init() {
    this.el = $('minimap');
    this.ctx = this.el.getContext('2d');
    this.off = document.createElement('canvas');
    this.off.width = this.off.height = (MINIMAP_R * 2 + 1) * CS;
    this.octx = this.off.getContext('2d');
    this.colors = this.blockColors();
    this.offsets = [];
    for (let dz = -MINIMAP_R; dz <= MINIMAP_R; dz++) for (let dx = -MINIMAP_R; dx <= MINIMAP_R; dx++) this.offsets.push([dx, dz, Math.hypot(dx, dz)]);
    this.offsets.sort((a, b) => a[2] - b[2]);
  },

  // average colour of the top texture of every block
  blockColors() {
    const tiles = G.renderer.textureTiles;
    const out = new Float32Array(256 * 3);
    for (let id = 1; id < 256; id++) {
      if (BLOCK_NAME[id] === undefined) continue;
      const px = tiles[BLOCK_TEX[id * 6 + 2]];
      if (!px) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 100) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      if (n) { out[id * 3] = r / n; out[id * 3 + 1] = g / n; out[id * 3 + 2] = b / n; }
    }
    return out;
  },

  paint(c) {
    const img = new ImageData(CS, CS);
    const d = img.data, col = this.colors, blocks = c.blocks;
    const top = Math.min(CH - 1, (c.maxY | 0) + 1);
    const hts = new Int16Array(CS * CS);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let id = 0, y = top, wy = -1;
      for (; y >= 0; y--) {
        const b = blocks[(y * CS + z) * CS + x];
        if (!b) continue;
        const rt = BLOCK_RT[b];
        if (rt === RT_NONE || rt === RT_CROSS || rt === RT_TORCH || rt === RT_WALL_TORCH || rt === RT_LADDER) continue;   // plants, torches
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
      // relief: lit from the north-west
      let s = 1;
      if (wy < 0) {
        const hn = z > 0 ? hts[i - CS] : h, hw = x > 0 ? hts[i - 1] : h;
        s = 1 + clamp((h - hn) * 0.07 + (h - hw) * 0.05, -0.28, 0.22);
      } else {
        // water: the deeper, the bluer
        const a = clamp(0.5 + (wy - y) * 0.05, 0.5, 0.9);
        const wt = c.waterTint;
        const wr = wt ? wt[i * 4] * 1.6 + 20 : 38, wg = wt ? wt[i * 4 + 1] * 1.2 + 30 : 92, wb = wt ? wt[i * 4 + 2] * 1.2 + 60 : 190;
        r = r * 0.6 * (1 - a) + wr * a; g = g * 0.6 * (1 - a) + wg * a; bl = bl * 0.6 * (1 - a) + wb * a;
      }
      if (id === 0) { r = 18; g = 22; bl = 30; }
      d[o] = r * s; d[o + 1] = g * s; d[o + 2] = bl * s; d[o + 3] = 255;
    }
    return img;
  },

  put(c, img) {
    const px = (c.cx - this.center[0] + MINIMAP_R) * CS, pz = (c.cz - this.center[1] + MINIMAP_R) * CS;
    if (px < 0 || pz < 0 || px >= this.off.width || pz >= this.off.height) return;
    this.octx.putImageData(img, px, pz);
  },

  update(dt) {
    const mode = G.settings.minimap;
    const show = mode !== 'off' && !G.onTitle && !G.hudHidden && !!G.world;
    if (!this.off) this.init();
    if (show !== this.shown) { this.shown = show; this.el.classList.toggle('hidden', !show); $('mapCoords').classList.toggle('hidden', !show); document.body.classList.toggle('minimap', show); }
    if (!show) return;
    const src = G.vehicle ? G.vehicle.pos : G.player.pos;
    const pcx = Math.floor(src[0] / CS), pcz = Math.floor(src[2] / CS);
    const w = G.world;
    let restitch = false;
    if (!this.center || this.center[0] !== pcx || this.center[1] !== pcz || this.world !== w) {
      this.center = [pcx, pcz];
      this.world = w;
      restitch = true;
      this.octx.clearRect(0, 0, this.off.width, this.off.height);
    }
    let budget = 6;
    for (const [dx, dz] of this.offsets) {
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.mesh) continue;
      let t = this.tiles.get(c);
      if ((!t || t.ver !== c.uploads) && budget > 0) {
        budget--;
        t = { ver: c.uploads, img: this.paint(c) };
        this.tiles.set(c, t);
        this.put(c, t.img);
      } else if (t && restitch) this.put(c, t.img);
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 20;
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
    ctx.beginPath();
    ctx.arc(half, half, rad, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#12161e';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = false;
    const ox = (this.center[0] - MINIMAP_R) * CS, oz = (this.center[1] - MINIMAP_R) * CS;
    ctx.setTransform(k, 0, 0, k, half - (pos[0] - ox) * k, half - (pos[2] - oz) * k);
    ctx.drawImage(this.off, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // a spot inside the circle, or pinned to its edge when it is further away
    const spot = (wx, wz, margin) => {
      let sx = (wx - pos[0]) * k, sz = (wz - pos[2]) * k;
      const d = Math.hypot(sx, sz), lim = rad - margin;
      const inside = d <= lim;
      if (!inside) { sx *= lim / d; sz *= lim / d; }
      return [half + sx, half + sz, inside];
    };
    // themed places
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = Math.round(13 * dpr) + 'px system-ui, "Segoe UI Emoji", sans-serif';
    for (const r of mapRegions()) {
      const [sx, sz, inside] = spot(r.x, r.z, 9 * dpr);
      ctx.globalAlpha = inside ? 1 : 0.75;
      ctx.fillText(r.p.icon, sx, sz);
    }
    ctx.globalAlpha = 1;
    // other players
    if (Net.on) for (const r of Net.peers.values()) {
      const p = r.jet ? r.jet.pos : r.pos;
      const [sx, sz] = spot(p[0], p[2], 5 * dpr);
      ctx.beginPath();
      ctx.arc(sx, sz, 4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(' + NET_COLORS[r.color].join(',') + ')';
      ctx.fill();
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    // you: an arrow pointing where you look
    ctx.translate(half, half);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7 * dpr);
    ctx.lineTo(5 * dpr, 6 * dpr);
    ctx.lineTo(0, 3 * dpr);
    ctx.lineTo(-5 * dpr, 6 * dpr);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // frame and north
    ctx.beginPath();
    ctx.arc(half, half, rad, 0, Math.PI * 2);
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.font = '700 ' + Math.round(11 * dpr) + 'px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(half, 9 * dpr, 7 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2b94b';
    ctx.fillText('N', half, 9.5 * dpr);
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

function mapRegions() { return G.world && G.world.gen ? G.world.gen.regions : []; }
