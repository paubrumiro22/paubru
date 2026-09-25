'use strict';
// Background chunk generation and meshing. A few Web Workers run the same world.js / mesher.js
// code (their sources are the page's own <script data-w> tags) so streaming terrain never
// stalls the frame. Anything that cannot start a worker (file:// pages, strict hosts) simply
// keeps the synchronous path in game.js.

// Runs inside each worker, after the shared sources.
function chunkWorkerMain() {
  let gen = null, genKey = '';
  const pack = (b) => b.u8.slice(0, b.count * VERT_BYTES);
  self.onmessage = (e) => {
    const m = e.data;
    if (m.t === 'gen') {
      const key = m.seed + ':' + m.type;
      if (key !== genKey) { gen = new WorldGen(m.seed, m.type); genKey = key; }
      const c = new Chunk(m.cx, m.cz);
      gen.generate(c);
      self.postMessage({ t: 'gen', epoch: m.epoch, cx: m.cx, cz: m.cz, blocks: c.blocks, heightmap: c.heightmap, grassTint: c.grassTint, foliageTint: c.foliageTint, maxY: c.maxY },
        [c.blocks.buffer, c.heightmap.buffer, c.grassTint.buffer, c.foliageTint.buffer]);
    } else if (m.t === 'mesh') {
      const chunks = new Map();
      for (const n of m.nb) chunks.set(chunkKey(n.cx, n.cz), n);
      const facing = new Map(m.facing);
      const world = {
        getChunk: (cx, cz) => chunks.get(chunkKey(cx, cz)),
        getFacing: (x, y, z) => { const f = facing.get(posKey(x, y, z)); return f !== undefined ? f : [0, 1, 4, 5][Math.floor(hash3(x, y, z, 7) * 4)]; },
      };
      const center = chunks.get(chunkKey(m.cx, m.cz));
      const res = buildChunkMesh(world, center);
      const o = pack(res.opaque), c = pack(res.cutout), w = pack(res.water);
      self.postMessage({ t: 'mesh', epoch: m.epoch, ver: m.ver, cx: m.cx, cz: m.cz, light: center.light, opaque: o, cutout: c, water: w },
        [center.light.buffer, o.buffer, c.buffer, w.buffer]);
    }
  };
  self.postMessage({ t: 'ready' });
}

const ChunkWorkers = {
  list: [], ok: false, epoch: 0,
  genPending: new Set(), meshPending: 0, genCount: 0,
  stats: { gen: 0, mesh: 0 },

  async init() {
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return false;
      const parts = [];
      for (const el of document.querySelectorAll('script[data-w]')) {
        if (el.src) {
          const r = await fetch(el.src);
          if (!r.ok) return false;
          parts.push(await r.text());
        } else parts.push(el.textContent);
      }
      if (!parts.length) return false;
      const src = parts.join('\n;\n') + '\n;(' + chunkWorkerMain.toString() + ')();\n';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = clamp((navigator.hardwareConcurrency || 4) - 1, 1, 3);
      const started = [];
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.load = 0;
        started.push(new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 6000);
          w.onerror = () => { clearTimeout(timer); resolve(false); };
          w.onmessage = (e) => {
            if (e.data && e.data.t === 'ready') { clearTimeout(timer); w.onmessage = (ev) => this.receive(w, ev.data); w.onerror = (ev) => this.fail(ev); resolve(true); }
          };
        }));
        this.list.push(w);
      }
      const ok = await Promise.all(started);
      this.ok = ok.every(Boolean);
      if (!this.ok) this.shutdown();
      return this.ok;
    } catch (e) {
      console.warn('Blocklands: chunk workers unavailable, generating on the main thread', e);
      this.shutdown();
      return false;
    }
  },

  shutdown() {
    for (const w of this.list) try { w.terminate(); } catch (e) { /* ignore */ }
    this.list = [];
    this.ok = false;
  },

  fail(e) {
    console.warn('Blocklands: a chunk worker failed, falling back to the main thread', e && e.message);
    this.shutdown();
    this.reset();
  },

  // A new world was loaded: forget everything in flight.
  reset() {
    this.epoch++;
    this.genPending.clear();
    this.meshPending = 0;
    for (const w of this.list) w.load = 0;
  },

  pick() {
    let best = null;
    for (const w of this.list) if (!best || w.load < best.load) best = w;
    return best;
  },

  canGen() { return this.ok && this.genPending.size < this.list.length * 4; },
  canMesh() { return this.ok && this.meshPending < this.list.length * 3; },

  gen(world, cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.genPending.has(key)) return;
    this.genPending.add(key);
    const w = this.pick();
    w.load++;
    w.postMessage({ t: 'gen', epoch: this.epoch, seed: world.seed, type: world.type, cx, cz });
  },

  mesh(world, c) {
    const nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = world.getChunk(c.cx + dx, c.cz + dz);
      if (!n) continue;
      const top = Math.min(CH, n.maxY + 2) * CS * CS;
      const e = { cx: n.cx, cz: n.cz, maxY: n.maxY, blocks: new Uint8Array(CS * CS * CH) };
      e.blocks.set(n.blocks.subarray(0, top));
      if (n === c) { e.grassTint = n.grassTint; e.foliageTint = n.foliageTint; }
      nb.push(e);
    }
    // orientation of blocks inside this chunk that face somewhere specific
    const facing = [];
    if (world.facing.size) {
      const x0 = c.cx * CS, z0 = c.cz * CS;
      for (const [k, f] of world.facing) {
        const [x, , z] = keyPos(k);
        if (x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS) facing.push([k, f]);
      }
    }
    c.meshVer = (c.meshVer || 0) + 1;
    c.needsMesh = false;
    c.meshInFlight = true;
    this.meshPending++;
    const w = this.pick();
    w.load++;
    w.postMessage({ t: 'mesh', epoch: this.epoch, ver: c.meshVer, cx: c.cx, cz: c.cz, nb, facing }, nb.map((e) => e.blocks.buffer));
  },

  receive(w, m) {
    w.load = Math.max(0, w.load - 1);
    if (m.t === 'gen') {
      if (m.epoch !== this.epoch) return;
      this.genPending.delete(chunkKey(m.cx, m.cz));
      const world = G.world;
      if (world.getChunk(m.cx, m.cz)) return;
      const c = new Chunk(m.cx, m.cz);
      c.blocks = m.blocks; c.heightmap = m.heightmap; c.grassTint = m.grassTint; c.foliageTint = m.foliageTint; c.maxY = m.maxY;
      world.addChunk(c);
      this.stats.gen++;
    } else if (m.t === 'mesh') {
      if (m.epoch !== this.epoch) return;
      this.meshPending = Math.max(0, this.meshPending - 1);
      const c = G.world.getChunk(m.cx, m.cz);
      // a newer mesh (worker or synchronous after an edit) supersedes this one
      if (!c || c.meshVer !== m.ver) return;
      c.meshInFlight = false;
      c.light = m.light;
      const wrap = (u8) => ({ count: u8.length / VERT_BYTES, data: () => u8 });
      G.renderer.uploadChunk(c, { opaque: wrap(m.opaque), cutout: wrap(m.cutout), water: wrap(m.water) });
      this.stats.mesh++;
    }
  },
};
