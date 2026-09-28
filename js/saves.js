'use strict';
// Saves live in IndexedDB, gzip-compressed, instead of localStorage (which tops out around
// 5 MB for the whole site). Everything is read into memory once at start-up, so the rest of the
// game keeps reading saves synchronously through storageGet; writes go to IndexedDB in the
// background. Saves left in localStorage by older versions move over on the first start.
// Without IndexedDB (some private windows) everything stays in localStorage as before.
//
// Worlds: any number of worlds, each with a name, the date it was last played and a picture of
// the last view (the title screen's Worlds list). The first world keeps its old storage key.

const WORLDS_KEY = 'blocklands.worlds.v1';
const SAVE_DB = 'blocklands', SAVE_STORE = 'saves';

const Saves = {
  db: null, ok: false, cache: new Map(), dirty: new Set(), timer: 0, busy: false, sizes: new Map(),

  // the keys that hold worlds (and their maps); small settings stay in localStorage
  big(key) {
    return key.startsWith('blocklands.world.') || key.startsWith('blocklands.slot.') || key.startsWith('blocklands.srv.') ||
      key === 'blocklands.online.v1' || key.startsWith('blocklands.map.') || key === WORLDS_KEY;
  },

  async init() {
    try {
      if (typeof indexedDB === 'undefined') return false;
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(SAVE_DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(SAVE_STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
        setTimeout(() => rej(new Error('timeout')), 4000);
      });
      const rows = await new Promise((res, rej) => {
        const out = [];
        const req = this.db.transaction(SAVE_STORE).objectStore(SAVE_STORE).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
        req.onerror = () => rej(req.error);
      });
      for (const [k, v] of rows) {
        try {
          const json = v.z ? await this.unzip(v.z) : v.j;
          this.cache.set(k, JSON.parse(json));
          this.sizes.set(k, v.z ? v.z.byteLength : json.length);
        } catch (e) { /* a damaged entry: skip it */ }
      }
      this.ok = true;
      // move worlds over from localStorage (kept there until the copy is safely written)
      const moved = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !this.big(k)) continue;
        if (!this.cache.has(k)) { try { this.cache.set(k, JSON.parse(localStorage.getItem(k))); this.dirty.add(k); } catch (e) { continue; } }
        moved.push(k);
      }
      if (moved.length) {
        await this.flush();
        for (const k of moved) if (!this.dirty.has(k)) localStorage.removeItem(k);
      }
      return true;
    } catch (e) {
      this.ok = false;
      return false;
    }
  },

  async zip(str) {
    const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(s).arrayBuffer();
  },
  async unzip(buf) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
  },

  get(key) { return this.cache.has(key) ? this.cache.get(key) : null; },
  set(key, value) {
    this.cache.set(key, value);
    this.dirty.add(key);
    // leaving the page: write right now, uncompressed (compression is asynchronous and the page
    // may be gone before it finishes); the next normal save compresses it again
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { this.flushNow(); return true; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
    return true;
  },
  del(key) {
    this.cache.delete(key); this.dirty.delete(key); this.sizes.delete(key);
    try { this.db.transaction(SAVE_STORE, 'readwrite').objectStore(SAVE_STORE).delete(key); } catch (e) { /* ignore */ }
  },

  flushNow() {
    if (!this.db || !this.dirty.size) return;
    try {
      const st = this.db.transaction(SAVE_STORE, 'readwrite').objectStore(SAVE_STORE);
      for (const k of this.dirty) { const j = JSON.stringify(this.cache.get(k)); st.put({ j, t: Date.now() }, k); this.sizes.set(k, j.length); }
      this.dirty.clear();
    } catch (e) { /* ignore */ }
  },

  async flush() {
    if (this.busy) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 300); return; }
    if (!this.db || !this.dirty.size) return;
    this.busy = true;
    try {
      const items = [];
      for (const k of this.dirty) items.push([k, JSON.stringify(this.cache.get(k))]);
      this.dirty.clear();
      const rows = [];
      for (const [k, j] of items) {
        if (typeof CompressionStream !== 'undefined' && j.length > 2048) { const z = await this.zip(j); rows.push([k, { z, t: Date.now() }]); this.sizes.set(k, z.byteLength); }
        else { rows.push([k, { j, t: Date.now() }]); this.sizes.set(k, j.length); }
      }
      await new Promise((res, rej) => {
        const tx = this.db.transaction(SAVE_STORE, 'readwrite');
        const st = tx.objectStore(SAVE_STORE);
        for (const [k, v] of rows) if (this.cache.has(k)) st.put(v, k);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
      });
    } catch (e) {
      if (G.ui) G.ui.toast('Could not save the world: ' + (e && e.name === 'QuotaExceededError' ? 'the device is out of space' : 'storage error'));
    }
    this.busy = false;
  },
};

// ---------------------------------------------------------------- worlds ----
const Worlds = {
  index: null,

  load() {
    let ix = storageGet(WORLDS_KEY);
    if (!ix || !Array.isArray(ix.list)) {
      ix = { cur: 'main', list: [] };
      const s = storageGet(SAVE_KEY);
      if (s) ix.list.push({ id: 'main', name: 'My world', seed: s.seed, type: s.type || 'default', mode: s.mode || 'survival', created: Date.now(), played: Date.now() });
    }
    this.index = ix;
    return ix;
  },
  save() { storageSet(WORLDS_KEY, this.index); },
  key(id) { return id === 'main' ? SAVE_KEY : 'blocklands.world.' + id; },
  cur() { return (this.index || this.load()).cur; },
  entry(id) { return (this.index || this.load()).list.find((w) => w.id === id); },

  // called by saveWorld for the world being played (not the Camp Nou or online worlds)
  touch(thumb) {
    const ix = this.index || this.load();
    let e = this.entry(ix.cur);
    if (!e) { e = { id: ix.cur, name: this.freshName(), created: Date.now() }; ix.list.push(e); }
    e.seed = G.world.seed; e.type = G.world.type; e.mode = G.mode; e.played = Date.now();
    e.money = G.money | 0; e.days = Math.floor(G.dayTime || 0);
    if (thumb) e.thumb = thumb;
    this.save();
  },
  freshName() {
    const n = (this.index ? this.index.list.length : 0) + 1;
    return n === 1 ? 'My world' : 'World ' + n;
  },

  // A picture of what the player sees, taken straight after a frame is drawn.
  wantThumb: false,
  capture(canvas) {
    this.wantThumb = false;
    try {
      const w = 320, h = Math.round(w * canvas.height / canvas.width) || 180;
      const c = this._c || (this._c = document.createElement('canvas'));
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(canvas, 0, 0, w, h);
      this.pendingThumb = c.toDataURL('image/jpeg', 0.72);
    } catch (e) { /* ignore */ }
  },

  create(name, seed, type, mode) {
    const ix = this.index || this.load();
    const id = 'w' + Date.now().toString(36);
    ix.list.push({ id, name: name || this.freshName(), seed, type, mode, created: Date.now(), played: Date.now() });
    this.save();
    return id;
  },

  // switch to another saved world (or a fresh one when it has no save yet)
  open(id, fresh) {
    if (typeof Net !== 'undefined' && Net.on) Net.leave();
    saveWorld();
    G.slot = null;
    const ix = this.index || this.load();
    ix.cur = id;
    this.save();
    const e = this.entry(id);
    const save = storageGet(this.key(id));
    if (save && !fresh) newWorld(save.seed, save, {});
    else newWorld(e.seed, null, { type: e.type || 'default', mode: e.mode || 'survival' });
    prepareArea(G.player.pos[0], G.player.pos[2], 2);
    liftOutOfBlocks(G.player);
    saveWorld();
    refreshGameUI();
  },

  remove(id) {
    const ix = this.index || this.load();
    if (id === ix.cur) return false;
    ix.list = ix.list.filter((w) => w.id !== id);
    Saves.ok ? Saves.del(this.key(id)) : localStorage.removeItem(this.key(id));
    for (const k of [...Saves.cache.keys()]) if (k === MAP_KEY + 'w.' + id) Saves.del(k);
    this.save();
    return true;
  },

  size(id) {
    const n = Saves.sizes.get(this.key(id));
    if (!n) return '';
    return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
  },
};

function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + ' days ago';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------- the Worlds panel ----
const WorldsPanel = {
  armed: null,
  open() {
    $('worldsPanel').classList.remove('hidden');
    this.render();
  },
  close() { $('worldsPanel').classList.add('hidden'); this.armed = null; },

  render() {
    const ix = Worlds.index || Worlds.load();
    const grid = $('worldsGrid');
    grid.innerHTML = '';
    const list = [...ix.list].sort((a, b) => (b.played || 0) - (a.played || 0));
    for (const w of list) {
      const cur = w.id === ix.cur && !G.slot && !G.online;
      const card = document.createElement('div');
      card.className = 'wcard' + (cur ? ' cur' : '');
      const pic = document.createElement('div');
      pic.className = 'wpic';
      if (w.thumb) pic.style.backgroundImage = 'url(' + w.thumb + ')';
      else pic.innerHTML = '<span>' + (w.type === 'flat' ? '▦' : '⛰') + '</span>';
      if (cur) { const b = document.createElement('i'); b.textContent = 'Playing'; pic.append(b); }
      const mode = document.createElement('em');
      mode.className = 'wmode ' + (w.mode === 'creative' ? 'cr' : 'sv');
      mode.textContent = w.mode === 'creative' ? 'Creative' : 'Survival';
      pic.append(mode);
      const info = document.createElement('div');
      info.className = 'winfo';
      const name = document.createElement('b'); name.textContent = w.name || 'World';
      const meta = document.createElement('small');
      meta.textContent = (w.type === 'flat' ? 'Flat' : 'Seed ' + w.seed) + ' · ' + timeAgo(w.played || w.created || Date.now());
      const size = Worlds.size(w.id);
      if (size) meta.textContent += ' · ' + size;
      info.append(name, meta);
      const acts = document.createElement('div');
      acts.className = 'wacts';
      const play = document.createElement('button');
      play.className = 'primary';
      play.textContent = cur ? 'Continue' : 'Play';
      play.addEventListener('click', () => {
        sfx('click', null, 1, 1);
        if (!cur) { Worlds.open(w.id); UI.toast('🌍 ' + (w.name || 'World')); }
        this.close();
        $('tWorld').textContent = worldLabel();
        requestLock();
      });
      const ren = document.createElement('button');
      ren.textContent = 'Rename';
      ren.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = w.name || ''; inp.maxLength = 32; inp.className = 'wrename';
        name.replaceWith(inp); inp.focus(); inp.select();
        const done = () => { w.name = inp.value.trim().slice(0, 32) || w.name; Worlds.save(); this.render(); };
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(); if (e.key === 'Escape') this.render(); });
        inp.addEventListener('blur', done);
      });
      acts.append(play, ren);
      if (!cur) {
        const del = document.createElement('button');
        del.className = 'danger';
        del.textContent = this.armed === w.id ? 'Delete forever?' : 'Delete';
        del.addEventListener('click', () => {
          if (this.armed !== w.id) { this.armed = w.id; this.render(); setTimeout(() => { if (this.armed === w.id) { this.armed = null; this.render(); } }, 4000); return; }
          this.armed = null;
          Worlds.remove(w.id);
          UI.toast('World deleted');
          this.render();
        });
        acts.append(del);
      }
      info.append(acts);
      card.append(pic, info);
      grid.append(card);
    }
  },

  create() {
    const name = $('nwName').value.trim().slice(0, 32);
    const raw = $('nwSeed').value.trim();
    let seed;
    if (!raw) seed = (Math.random() * 2147483647) | 0;
    else if (/^-?\d+$/.test(raw)) seed = Number(raw) | 0;
    else { seed = 0; for (let i = 0; i < raw.length; i++) seed = (Math.imul(seed, 31) + raw.charCodeAt(i)) | 0; }
    const type = $('nwType').value, mode = $('nwMode').value;
    const id = Worlds.create(name, seed, type, mode);
    Worlds.open(id, true);
    $('nwName').value = ''; $('nwSeed').value = '';
    this.close();
    $('tWorld').textContent = worldLabel();
    UI.toast('🌍 New world · ' + (name || Worlds.entry(id).name));
    requestLock();
  },

  bind() {
    $('tWorlds').addEventListener('click', () => { sfx('click', null, 1, 1); this.open(); });
    $('worldsBack').addEventListener('click', () => this.close());
    $('nwCreate').addEventListener('click', () => this.create());
    for (const id of ['nwName', 'nwSeed']) $(id).addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.create(); });
  },
};
