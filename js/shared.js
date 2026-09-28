'use strict';
// What a server shares besides blocks, live between players (P2P, else the relay) and kept in the
// cloud (table bl_state in supabase.sql, newest wins):
// - containers: the contents of chests, barrels, furnaces, brewing stands, kitchen cabinets and
//   fridges ('be:<posKey>'), sent when someone closes one, when it is broken, and every few
//   seconds for the furnaces the host is running;
// - animals: the host runs them for everybody (like the villagers): the others see mirrors that
//   follow the host's positions, and the host keeps the list in the cloud ('mobs'), so the
//   animals are still there when the next player comes back;
// - plots: a Plot Stone claims the land around it ('claim:<id>'); on a server only its owner and
//   the players they trust can build, break or open containers there.

const SHARE_BE = new Set(['chest', 'furnace', 'brew']);

const SharedState = {
  times: new Map(), queue: new Map(), server: null, rev: 0, loading: false, loaded: false,
  pollT: 0, flushT: 0, beT: 0, sent: new Map(), peers: 0, failed: false,

  on() { return !!(Net.on && Net.server); },

  put(k, v) {
    if (!this.on()) return;
    const t = Date.now();
    this.times.set(k, t);
    Net.sendState({ k, v, t });
    this.queue.set(k, { server: Net.server.code, k, v, t });
    if (!this.flushT) this.flushT = setTimeout(() => { this.flushT = 0; this.flush(); }, 1500);
  },
  receive(d) {
    if (!d || typeof d.k !== 'string' || d.k.length > 64 || !Number.isFinite(d.t)) return;
    if (d.t <= (this.times.get(d.k) || 0)) return;
    this.times.set(d.k, d.t);
    try { this.apply(d.k, d.v === undefined ? null : d.v); } catch (e) { console.warn('Blocklands: shared state', e); }
  },
  apply(k, v) {
    if (k.startsWith('be:')) this.applyBE(Number(k.slice(3)), v);
    else if (k.startsWith('claim:')) Claims.apply(k.slice(6), v);
    else if (k === 'mobs' && this.loading && !Net.peers.size && v && Array.isArray(v.list)) SharedAnimals.adopt(v.list);
  },

  // ---- containers ----
  clean(s) {
    if (!s || !isItem(s.id)) return null;
    const c = { id: s.id, count: clamp(s.count | 0, 1, 64), dmg: Math.max(0, s.dmg | 0) };
    if (s.ench && typeof s.ench === 'object') c.ench = s.ench;
    return c;
  },
  applyBE(pk, v) {
    if (!Number.isFinite(pk) || !G.world) return;
    const w = G.world, ui = G.ui;
    if (!v) {
      w.blockEntities.delete(pk);
      if (ui && ui.screen && ui.screen.key === pk) ui.closeScreen(true);
      return;
    }
    if (typeof v !== 'object' || !SHARE_BE.has(v.type) || !Array.isArray(v.slots) || v.slots.length > 54) return;
    const slots = v.slots.map((s) => this.clean(s));
    let be = w.blockEntities.get(pk);
    if (!be || be.type !== v.type) { be = { type: v.type, slots: [] }; w.blockEntities.set(pk, be); }
    be.slots.length = 0;
    for (const s of slots) be.slots.push(s);
    for (const f of ['burn', 'burnMax', 'cook', 't']) if (Number.isFinite(v[f])) be[f] = v[f];
    this.sent.set(pk, JSON.stringify(be));
    if (ui && ui.screen && ui.screen.key === pk) ui.invDirty();
  },
  shareBE(pk) {
    if (!this.on()) return;
    const be = G.world.blockEntities.get(pk);
    const json = be ? JSON.stringify(be) : 'null';
    if (this.sent.get(pk) === json) return;
    this.sent.set(pk, json);
    this.put('be:' + pk, be ? JSON.parse(json) : null);
  },

  // ---- the cloud copy ----
  async load() {
    const code = Net.server.code;
    this.loading = true;
    try {
      for (;;) {
        const rows = await Cloud.req('bl_state?select=k,v,t,rev&server=eq.' + code + '&rev=gt.' + this.rev + '&order=rev.asc&limit=' + CLOUD_PAGE);
        if (!this.on() || Net.server.code !== code) return;
        for (const r of rows) { if (r.rev > this.rev) this.rev = r.rev; this.receive({ k: r.k, v: r.v, t: Number(r.t) }); }
        if (rows.length < CLOUD_PAGE) break;
      }
      this.failed = false;
    } catch (e) { this.failed = true; }
    this.loading = false;
    this.loaded = true;
  },
  async flush() {
    if (!this.queue.size || this.failed || Cloud.state !== 'ok') return;
    const rows = [...this.queue.values()];
    this.queue.clear();
    try {
      await Cloud.req('bl_state', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows), noBody: true });
    } catch (e) {
      // table missing (old setup): everything still goes player to player
      if (!(e && /bl_state|PGRST205|42P01/.test(e.body || ''))) for (const r of rows) if (!this.queue.has(r.k)) this.queue.set(r.k, r);
      this.failed = /bl_state|PGRST205|42P01/.test((e && e.body) || '');
    }
  },

  update(dt) {
    if (!this.on()) { if (this.server) { this.server = null; this.times.clear(); this.sent.clear(); this.rev = 0; this.loaded = false; } return; }
    if (this.server !== Net.server.code) { this.server = Net.server.code; this.rev = 0; this.loaded = false; this.times.clear(); this.sent.clear(); }
    if (!this.loaded && !this.loading && Cloud.state === 'ok') this.load();
    this.pollT -= dt;
    if (this.loaded && this.pollT <= 0 && !this.loading && !this.failed) { this.pollT = document.hidden ? 15 : 5; this.load(); }
    // whoever joins gets the plots and the containers we know
    if (Net.peers.size > this.peers) this.greet();
    this.peers = Net.peers.size;
    // the host shares the furnaces it keeps burning
    this.beT -= dt;
    if (this.beT <= 0 && Net.isHost()) {
      this.beT = 6;
      const p = G.player.pos;
      for (const [pk, be] of G.world.blockEntities) {
        if (be.type !== 'furnace' && be.type !== 'brew') continue;
        const [x, , z] = keyPos(pk);
        if (Math.abs(x - p[0]) < 96 && Math.abs(z - p[2]) < 96) this.shareBE(pk);
      }
    }
  },
  greet() {
    let n = 0;
    for (const c of Claims.map.values()) { Net.sendState({ k: 'claim:' + c.id, v: c, t: this.times.get('claim:' + c.id) || c.t || 1 }); n++; }
    for (const [pk, be] of G.world.blockEntities) {
      if (!SHARE_BE.has(be.type) || n++ > 150) continue;
      const t = this.times.get('be:' + pk);
      if (t) Net.sendState({ k: 'be:' + pk, v: be, t });
    }
  },
};

// ---------------------------------------------------------------- animals ----
const SharedAnimals = {
  byAid: new Map(), client: false, spawning: false,

  // host: the animals near any player go out with the villagers (Net.sendMobs)
  collect(list, near) {
    for (const m of Ents.mobs) {
      if (m.removed || m.vid || m.mirror || m.def.hostile || (m.def.custom && !m.def.pet)) continue;
      if (!near.some((p) => Math.abs(p[0] - m.pos[0]) < 96 && Math.abs(p[2] - m.pos[2]) < 96)) continue;
      if (!m.aid) { m.aid = 'a:' + Math.random().toString(36).slice(2, 10); this.byAid.set(m.aid, m); }
      list.push([m.aid, r1(m.pos[0]), r1(m.pos[1]), r1(m.pos[2]), r2(m.bodyYaw), m.dead ? 1 : 0, m.type, (m.sheared ? 16 : 0) | (m.woolColor | 0)]);
      if (list.length >= 200) break;
    }
  },
  // everybody else: mirror them
  heard(list) {
    if (Net.isHost()) return;
    const now = performance.now();
    this.spawning = true;
    try {
      for (const e of list) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[0].startsWith('a:')) continue;
        const [x, y, z, yaw] = [e[1], e[2], e[3], e[4]].map(Number);
        if (![x, y, z, yaw].every(Number.isFinite)) continue;
        let m = this.byAid.get(e[0]);
        if (!m || m.removed) {
          const def = MOB_TYPES[e[6]];
          if (!def || def.hostile || !G.world.isLoaded(Math.floor(x), Math.floor(z))) continue;
          m = Ents.spawnMob(e[6], x, y, z);
          m.aid = e[0]; m.mirror = true; m.bodyYaw = m.headYaw = yaw;
          this.byAid.set(e[0], m);
        }
        m.sheared = !!(e[7] & 16); m.woolColor = (e[7] | 0) & 15;
        m.heardAt = now;
        if (e[5] && !m.dead) { m.remote = false; m.die({}); continue; }
        m.remote = true;
        m.net = { x, y, z, yaw, t: now };
      }
    } finally { this.spawning = false; }
  },
  // the cloud's animals replace this device's when you are the first one on the server
  adopt(list) {
    for (const m of Ents.mobs) if (Ents.keepable(m)) m.removed = true;
    Ents.loadMobs(list);
  },

  update(dt) {
    const on = SharedState.on() && Net.peers.size > 0;
    const client = on && !Net.isHost();
    if (client && !this.client) {
      // someone else runs the animals now: ours go (they are in the host's world too)
      Ents.stashed = [];
      for (const m of Ents.mobs) if (!m.mirror && Ents.keepable(m)) m.removed = true;
    }
    if (!client && this.client) {
      // we are the host now: the mirrors become real animals
      for (const m of this.byAid.values()) { m.mirror = false; m.remote = false; }
    }
    this.client = client;
    if (client) {
      const now = performance.now();
      for (const [aid, m] of this.byAid) if (m.removed || (m.mirror && now - (m.heardAt || 0) > 2500)) { m.removed = true; this.byAid.delete(aid); }
    }
    // the host keeps the list in the cloud
    this.saveT = (this.saveT || 20) - dt;
    if (this.saveT <= 0) {
      this.saveT = 30;
      if (SharedState.on() && Net.isHost() && SharedState.loaded) SharedState.put('mobs', { list: Ents.serializeMobs() });
    }
  },
};

// ---------------------------------------------------------------- plots ----
const PLOT_SIZES = [8, 12, 16];   // half size: 17×17, 25×25, 33×33
const Claims = {
  map: new Map(), warnT: 0, tagT: 0, here: null,

  load() {
    this.map.clear();
    const src = G.prog && G.prog.claims;
    if (src && typeof src === 'object') for (const id in src) this.apply(id, src[id], true);
  },
  store() { if (!G.prog) G.prog = {}; G.prog.claims = Object.fromEntries(this.map); },
  valid(c) {
    return c && typeof c === 'object' && typeof c.o === 'string' && [c.x, c.y, c.z, c.r].every(Number.isFinite) && c.r >= 4 && c.r <= 24 && Array.isArray(c.trust || []);
  },
  apply(id, v, quiet) {
    if (!v) this.map.delete(id);
    else if (this.valid(v)) this.map.set(id, { id, o: v.o, n: typeof v.n === 'string' ? v.n.slice(0, 16) : 'Someone', x: v.x, y: v.y, z: v.z, r: v.r, trust: (v.trust || []).filter((t) => typeof t === 'string').slice(0, 24), tn: v.tn && typeof v.tn === 'object' ? v.tn : {}, open: !!v.open, t: v.t || Date.now() });
    if (!quiet) { this.store(); if (ClaimPanel.open && ClaimPanel.id === id) ClaimPanel.render(); }
  },
  share(c) { c.t = Date.now(); this.store(); SharedState.put('claim:' + c.id, c); },

  at(x, z) {
    for (const c of this.map.values()) if (Math.abs(x + 0.5 - (c.x + 0.5)) <= c.r + 0.5 && Math.abs(z + 0.5 - (c.z + 0.5)) <= c.r + 0.5) return c;
    return null;
  },
  mine(c) { return c.o === Net.owner; },
  trusted(c) { return this.mine(c) || c.open || c.trust.includes(Net.owner); },
  // may this player change things at (x, z)? (only enforced on servers)
  can(x, z) {
    if (!Net.on || !Net.server) return true;
    const c = this.at(x, z);
    return !c || this.trusted(c);
  },
  deny(x, z) {
    if (this.warnT > 0) return;
    this.warnT = 2;
    const c = this.at(x, z);
    G.ui.toast('🔒 This is ' + (c ? c.n : 'someone') + '’s plot: ask them to let you build', 2500);
    sfx('gate_no', null, 0.6, 1);
  },

  create(x, y, z) {
    const r = PLOT_SIZES[0];
    for (const c of this.map.values()) if (Math.abs(c.x - x) <= c.r + r && Math.abs(c.z - z) <= c.r + r) return c;
    const id = String(posKey(x, y, z));
    const c = { id, o: Net.owner, n: Net.name, x, y, z, r, trust: [], tn: {}, open: false };
    this.map.set(id, c);
    this.share(c);
    G.ui.toast('🏠 Your plot: ' + (2 * r + 1) + ' × ' + (2 * r + 1) + ' blocks. Right-click the stone to manage it', 3500);
    sfx('chime', null, 0.6, 1.2);
    return null;
  },
  release(id) {
    if (!this.map.has(id)) return;
    this.map.delete(id);
    this.store();
    SharedState.put('claim:' + id, null);
  },

  update(dt) {
    this.warnT -= dt;
    this.tagT -= dt;
    const p = G.player;
    if (!p || !G.world) return;
    if (this.tagT <= 0) {
      this.tagT = 0.3;
      const c = this.at(Math.floor(p.pos[0]), Math.floor(p.pos[2]));
      const tag = $('plotTag');
      if (tag) {
        if (c) {
          tag.innerHTML = '';
          const b = document.createElement('b'); b.textContent = '🏠 ' + (this.mine(c) ? 'Your plot' : c.n + '’s plot');
          const s = document.createElement('span'); s.textContent = this.mine(c) ? (c.trust.length ? c.trust.length + ' friend' + (c.trust.length > 1 ? 's' : '') + ' can build' : 'only you build here') : this.trusted(c) ? 'you can build here' : 'look, don’t touch';
          tag.append(b, s);
          tag.classList.toggle('lock', !this.trusted(c) && !!Net.server);
        }
        tag.classList.toggle('show', !!c);
      }
      if (c !== this.here && c && !this.mine(c) && Net.server) G.ui.toast('🏠 Entering ' + c.n + '’s plot', 1800);
      this.here = c;
    }
    // the border glows while you hold a Plot Stone or stand at your stone
    const held = G.inv.held;
    const show = (held && held.id === B.PLOT_STONE) || ClaimPanel.open;
    if (show && (G.frameCount & 3) === 0) {
      for (const c of this.map.values()) {
        if (Math.abs(c.x - p.pos[0]) > c.r + 40 || Math.abs(c.z - p.pos[2]) > c.r + 40) continue;
        const col = this.mine(c) ? [0.45, 1, 0.55] : this.trusted(c) ? [0.5, 0.8, 1] : [1, 0.45, 0.35];
        for (let i = 0; i < 6; i++) {
          const side = Math.floor(Math.random() * 4), t = rand(-c.r, c.r + 1);
          const x = side === 0 ? c.x - c.r : side === 1 ? c.x + c.r + 1 : c.x + t, z = side === 2 ? c.z - c.r : side === 3 ? c.z + c.r + 1 : c.z + t;
          if (Math.hypot(x - p.pos[0], z - p.pos[2]) > 34) continue;
          const y = G.world.surfaceHeight(Math.floor(x), Math.floor(z)) + 1.1 + Math.random() * 0.6;
          Particles.add(Particles.base(x, y, z, { vy: 0.35, life: 1.2, max: 1.2, size: 0.07, r: col[0], g: col[1], b: col[2], glow: true, collide: false, drag: 1 }));
        }
      }
    }
  },
};

// ---------------------------------------------------------------- the plot panel ----
const ClaimPanel = {
  el: null, open: false, id: null,
  show(id) {
    this.id = id;
    this.open = true;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'claimPanel';
      this.el.className = 'overlay';
      document.body.append(this.el);
      this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    }
    this.render();
    this.el.classList.remove('hidden');
  },
  close() {
    if (!this.open) return;
    this.open = false;
    G.screenOpen = false;
    this.el.classList.add('hidden');
    requestLock();
  },
  render() {
    const c = Claims.map.get(this.id), el = this.el;
    if (!c) { this.close(); return; }
    const mine = Claims.mine(c), side = 2 * c.r + 1;
    const online = [...Net.peers.values()].filter((r) => r.owner && r.owner !== c.o);
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'cp-card';
    card.innerHTML = `<div class="cp-head"><i>🏠</i><div><b></b><span>${side} × ${side} blocks · ${Net.server ? 'server ' + Net.server.code : 'this world'}</span></div><button class="cp-x">✕</button></div>`;
    card.querySelector('b').textContent = mine ? 'Your plot' : c.n + '’s plot';
    card.querySelector('.cp-x').addEventListener('click', () => this.close());
    const body = document.createElement('div');
    body.className = 'cp-body';
    if (mine) {
      const sz = document.createElement('div');
      sz.className = 'cp-row';
      sz.innerHTML = '<label>Size</label>';
      for (const r of PLOT_SIZES) {
        const b = document.createElement('button');
        b.textContent = (2 * r + 1) + '×' + (2 * r + 1);
        b.className = r === c.r ? 'on' : '';
        b.addEventListener('click', () => {
          for (const o of Claims.map.values()) if (o !== c && Math.abs(o.x - c.x) <= o.r + r && Math.abs(o.z - c.z) <= o.r + r) { G.ui.toast('Too close to ' + o.n + '’s plot for that size'); return; }
          c.r = r; Claims.share(c); this.render();
        });
        sz.append(b);
      }
      body.append(sz);
      const op = document.createElement('label');
      op.className = 'cp-toggle';
      op.innerHTML = '<input type="checkbox"><span>Anyone may build here</span>';
      op.querySelector('input').checked = c.open;
      op.querySelector('input').addEventListener('change', (e) => { c.open = e.target.checked; Claims.share(c); this.render(); });
      body.append(op);
      const h = document.createElement('h4'); h.textContent = 'Friends who can build';
      body.append(h);
      const list = document.createElement('div');
      list.className = 'cp-list';
      if (!c.trust.length) list.innerHTML = '<span class="cp-none">Nobody yet</span>';
      for (const t of c.trust) {
        const chip = document.createElement('span');
        chip.className = 'cp-chip';
        chip.textContent = c.tn[t] || 'Player';
        const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Remove';
        x.addEventListener('click', () => { c.trust = c.trust.filter((q) => q !== t); Claims.share(c); this.render(); });
        chip.append(x);
        list.append(chip);
      }
      body.append(list);
      const add = online.filter((r) => !c.trust.includes(r.owner));
      if (add.length) {
        const h2 = document.createElement('h4'); h2.textContent = 'Players online';
        body.append(h2);
        const row = document.createElement('div');
        row.className = 'cp-list';
        for (const r of add) {
          const b = document.createElement('button');
          b.className = 'cp-add';
          b.textContent = '＋ ' + r.name;
          b.addEventListener('click', () => { c.trust.push(r.owner); c.tn[r.owner] = r.name; Claims.share(c); this.render(); G.ui.toast(r.name + ' can build on your plot now'); });
          row.append(b);
        }
        body.append(row);
      } else if (Net.server) { const p = document.createElement('p'); p.className = 'cp-note'; p.textContent = 'Friends appear here while they are online on this server.'; body.append(p); }
      else { const p = document.createElement('p'); p.className = 'cp-note'; p.textContent = 'Plots protect your builds on online servers: only you and the friends you add can build, break or open chests inside.'; body.append(p); }
      const rel = document.createElement('button');
      rel.className = 'cp-release';
      rel.textContent = 'Give up the plot';
      rel.addEventListener('click', () => {
        if (!rel.dataset.armed) { rel.dataset.armed = '1'; rel.textContent = 'Sure? The land stays, the protection goes'; return; }
        Claims.release(c.id);
        destroyBlock(c.x, c.y, c.z, { drops: G.mode === 'survival' });
        this.close();
      });
      body.append(rel);
    } else {
      const p = document.createElement('p');
      p.className = 'cp-note';
      p.textContent = Claims.trusted(c) ? c.n + ' lets you build here.' : 'Only ' + c.n + (c.trust.length ? ' and ' + c.trust.length + ' friend' + (c.trust.length > 1 ? 's' : '') : '') + ' can build, break or open containers here. Ask them to add you.';
      body.append(p);
    }
    card.append(body);
    el.append(card);
  },
};

// ---------------------------------------------------------------- hooks ----
{
  // containers: share on closing, and when they go
  const close = UI.closeScreen;
  UI.closeScreen = function (silent) {
    const s = this.screen;
    const r = close.call(this, silent);
    if (s && s.key !== undefined && (s.kind === 'chest' || s.kind === 'furnace' || s.kind === 'brew')) SharedState.shareBE(s.key);
    return r;
  };
  const cleanup = cleanupBlockEntity;
  // eslint-disable-next-line no-global-assign
  cleanupBlockEntity = function (x, y, z, old, id) {
    const pk = posKey(x, y, z), had = G.world.blockEntities.has(pk);
    const r = cleanup.call(this, x, y, z, old, id);
    if (had && !G.world.blockEntities.has(pk) && Net.capture !== false) SharedState.shareBE(pk);
    return r;
  };

  // animals: mirrors are not this player's to keep; no animals of your own while someone else hosts
  const keep = Ents.keepable;
  Ents.keepable = function (m) { return !m.mirror && !m.aidMirror && keep.call(this, m); };
  const spawn = Ents.spawnMob;
  Ents.spawnMob = function (type, x, y, z) {
    const m = spawn.call(this, type, x, y, z);
    if (SharedAnimals.client && !SharedAnimals.spawning && MOB_TYPES[type] && !MOB_TYPES[type].hostile && type !== 'villager' && !m.vid) m.removed = true;
    return m;
  };

  // plots
  const mining = Act.updateMining;
  Act.updateMining = function (dt, now) {
    const t = this.target, b = t && t.block;
    if (G.mouse.left && b && !Claims.can(b.pos[0], b.pos[2])) { this.mine.pos = null; this.mine.progress = 0; Claims.deny(b.pos[0], b.pos[2]); return; }
    return mining.call(this, dt, now);
  };
  const place = Act.placeBlock;
  Act.placeBlock = function (hit) {
    const n = hit.normal, cell = BLOCK_REPLACE[hit.id] ? hit.pos : [hit.pos[0] + n[0], hit.pos[1] + n[1], hit.pos[2] + n[2]];
    if (!Claims.can(cell[0], cell[2])) { Claims.deny(cell[0], cell[2]); return false; }
    const held = G.inv.held;
    const plot = held && held.id === B.PLOT_STONE;
    const ok = place.call(this, hit);
    if (ok && plot) {
      const other = Claims.create(cell[0], cell[1], cell[2]);
      if (other) {
        // too close to someone's plot: take it back
        editBlock(cell[0], cell[1], cell[2], B.AIR);
        if (G.mode === 'survival') G.inv.add(mkStack(B.PLOT_STONE, 1));
        G.ui.invDirty();
        G.ui.toast('🏠 Too close to ' + other.n + '’s plot', 2500);
      }
    }
    return ok;
  };
  const CONTAINERS = new Set([B.CHEST, B.BARREL, B.FURNACE, B.FURNACE_LIT, B.BREWING_STAND, B.KITCHEN_COUNTER, B.KITCHEN_SINK, B.FRIDGE, B.FRIDGE_TOP]);
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block;
    if (initial && b && !G.player.sneaking) {
      if (b.id === B.PLOT_STONE) {
        const c = Claims.map.get(String(posKey(b.pos[0], b.pos[1], b.pos[2])));
        if (c) { ClaimPanel.show(c.id); this.swingHand(); return true; }
        // a stone from before (or whose plot was given up): claim again
        if (!Claims.create(b.pos[0], b.pos[1], b.pos[2])) { this.swingHand(); return true; }
      }
      if (CONTAINERS.has(b.id) && !Claims.can(b.pos[0], b.pos[2])) { Claims.deny(b.pos[0], b.pos[2]); return true; }
    }
    return use.call(this, initial);
  };
  const destroy = destroyBlock;
  // eslint-disable-next-line no-global-assign
  destroyBlock = function (x, y, z, opts) {
    const id = G.world.getBlock(x, y, z);
    const r = destroy.call(this, x, y, z, opts);
    if (r && id === B.PLOT_STONE && opts && opts.tool !== undefined) Claims.release(String(posKey(x, y, z)));
    return r;
  };
  // a plot stone broken by somebody else's edit (or an explosion) ends the claim too
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    const res = ap.call(this, r, o);
    if (o[1] === 'b' && Number(o[5]) === 0) { const id = String(posKey(Number(o[2]), Number(o[3]), Number(o[4]))); if (Claims.map.has(id) && G.world.getBlock(Number(o[2]), Number(o[3]), Number(o[4])) !== B.PLOT_STONE) Claims.apply(id, null); }
    return res;
  };
  // plots on the big map
  const draw0 = WorldMap.draw;
  WorldMap.draw = function () {
    draw0.call(this);
    if (!Claims.map.size || !this.ctx) return;
    const ctx = this.ctx, cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const sx = (x) => (x - this.cx) * this.k * dpr + cv.width / 2, sy = (z) => (z - this.cz) * this.k * dpr + cv.height / 2;
    ctx.save();
    for (const c of Claims.map.values()) {
      const col = Claims.mine(c) ? '80,220,110' : Claims.trusted(c) ? '90,170,255' : '255,110,90';
      const x0 = sx(c.x - c.r), y0 = sy(c.z - c.r), w = (2 * c.r + 1) * this.k * dpr;
      ctx.fillStyle = 'rgba(' + col + ',0.18)'; ctx.fillRect(x0, y0, w, w);
      ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeRect(x0, y0, w, w);
      if (w > 40 * dpr) { ctx.setLineDash([]); ctx.fillStyle = 'rgba(' + col + ',1)'; ctx.font = '700 ' + Math.round(11 * dpr) + 'px system-ui'; ctx.fillText('🏠 ' + c.n, x0 + 4 * dpr, y0 + 14 * dpr); }
    }
    ctx.restore();
  };
  // plots are kept with the world (G.prog.claims)
  const nw = newWorld;
  // eslint-disable-next-line no-global-assign
  newWorld = function () { const r = nw.apply(this, arguments); Claims.load(); return r; };
  window.addEventListener('keydown', (e) => { if (ClaimPanel.open && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopImmediatePropagation(); ClaimPanel.close(); } }, true);
}

gen('plot_stone_top', (d, rng) => fillTile(d, (x, y) => {
  const edge = x < 2 || y < 2 || x > 29 || y > 29;
  const house = (y >= 10 && y <= 22 && x >= 9 && x <= 22) || (y >= 5 && y < 10 && Math.abs(x - 15.5) < (y - 3));
  const door = y >= 16 && y <= 22 && x >= 14 && x <= 17;
  put(d, x, y, edge ? [70, 72, 78] : door ? [120, 80, 44] : house ? [230, 196, 90] : [150, 152, 158], 0.9 + rng() * 0.1);
}), { smooth: 0.4, bump: 0.8 });
gen('plot_stone_side', (d, rng) => fillTile(d, (x, y) => put(d, x, y, y < 4 ? [230, 196, 90] : [150, 152, 158], (y % 9 === 0 ? 0.85 : 1) * (0.9 + rng() * 0.1))), { smooth: 0.3, bump: 0.8 });
shaped(B.PLOT_STONE, 1, ['GGG', 'SPS', 'SSS'], { G: I.GOLD_INGOT, S: B.STONE_BRICKS || B.STONE, P: I.PAPER });
