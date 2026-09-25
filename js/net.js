'use strict';
// Online play. Everyone who opens the published page joins one shared world ("online world").
// Transport: the claude.ai artifact "room" (presence + events between people viewing the page)
// or, outside claude.ai, a BroadcastChannel so several tabs of the same browser can play
// together. Each player publishes a small presence object (position, look, aircraft, the last
// few block edits / explosions as numbered "ops"); newcomers get the full edit history from the
// longest-present player over the "sync" topic. Mobs stay local to each player.

const ONLINE_SEED = 20250925;
const ONLINE_SAVE_KEY = 'blocklands.online.v1';
const NET_KEY = 'blocklands.net.v1';
const NET_OPS = 80;               // ops kept in presence (edits, explosions, missiles, chat)
const NET_COLORS = [[230, 72, 60], [60, 140, 240], [70, 200, 90], [240, 190, 40], [190, 90, 230], [40, 200, 200], [250, 130, 40], [240, 110, 170]];

const Net = {
  available: false, kind: null, on: false, room: null, bc: null,
  selfPeer: null, name: '', color: 0,
  peers: new Map(),            // peer -> remote player state
  ops: [], seq: 0, capture: true,
  sendT: 0, lastSent: '', chat: [], statusText: '',
  syncBuf: new Map(),

  async init() {
    const saved = storageGet(NET_KEY) || {};
    this.name = typeof saved.name === 'string' && saved.name.trim() ? saved.name.slice(0, 16) : 'Player' + Math.floor(100 + Math.random() * 900);
    this.color = Number.isInteger(saved.color) ? clamp(saved.color, 0, NET_COLORS.length - 1) : Math.floor(Math.random() * NET_COLORS.length);
    // claude.ai viewer: the artifact room
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const room = await Promise.race([window.claude.use('room'), new Promise((r) => setTimeout(() => r(null), 12000))]);
        if (room) { this.room = room; this.kind = 'room'; this.available = true; this.refreshUI(); return; }
      }
    } catch (e) { console.warn('Blocklands: room unavailable', e); }
    // anywhere else: tabs of this browser
    if (typeof BroadcastChannel !== 'undefined') {
      this.kind = 'local';
      this.available = true;
      this.selfPeer = 'tab-' + Math.random().toString(36).slice(2, 10);
    }
    this.refreshUI();
  },

  saveProfile() { storageSet(NET_KEY, { name: this.name, color: this.color }); },

  // ------------------------------------------------------------ session ----
  join() {
    if (!this.available || this.on) return;
    saveWorld();
    this.on = true;
    G.online = true;
    this.ops = []; this.seq = 0; this.peers.clear(); this.syncBuf.clear();
    const save = storageGet(ONLINE_SAVE_KEY);
    newWorld(ONLINE_SEED, save && save.v === 2 ? save : null, { mode: G.mode, type: 'default' });
    prepareArea(G.player.pos[0], G.player.pos[2], 2);
    liftOutOfBlocks(G.player);
    if (this.kind === 'room') this.bindRoom();
    else this.bindLocal();
    this.sendPresence(true);
    // background tabs pause animation frames: keep announcing from a timer
    clearInterval(this.hb);
    this.hb = setInterval(() => { if (this.on) this.sendPresence(this.kind === 'local'); }, 1000);
    this.statusText = 'Online';
    document.body.classList.add('online');
    this.refreshUI();
    G.ui.toast('Joined the online world as ' + this.name);
  },

  leave() {
    if (!this.on) return;
    saveWorld();
    this.on = false;
    G.online = false;
    clearInterval(this.hb);
    if (this.unsub) for (const u of this.unsub) try { u(); } catch (e) { /* ignore */ }
    this.unsub = [];
    if (this.room) this.room.presence({ w: null, p: null, v: null, q: null }).catch(() => {});
    if (this.bc) { this.bc.postMessage({ t: 'bye', peer: this.selfPeer }); this.bc.close(); this.bc = null; }
    this.peers.clear();
    document.body.classList.remove('online');
    const save = loadSave();
    newWorld(save ? save.seed : (Math.random() * 2147483647) | 0, save, { mode: 'survival', type: 'default' });
    prepareArea(G.player.pos[0], G.player.pos[2], 2);
    this.refreshUI();
    G.ui.toast('Back to your own world');
  },

  // ------------------------------------------------------------ transports ----
  bindRoom() {
    const room = this.room;
    this.unsub = [];
    this.unsub.push(room.onPeers((ch) => {
      for (const peer of ch.peers) {
        if (peer.isMe && peer.sameTab) { this.selfPeer = peer.peer; continue; }
        this.onPresence(peer.peer, peer.presence);
      }
      for (const peer of ch.left) this.dropPeer(peer.peer);
      for (const peer of ch.joined) if (!(peer.isMe && peer.sameTab)) this.maybeServe(peer.peer);
    }, () => { this.statusText = 'Offline (room closed)'; this.refreshUI(); }));
    this.unsub.push(room.on('sync', (msg) => { if (!msg.sameTab) this.onSync(msg.data); }));
    this.unsub.push(room.on('need', (msg) => { if (!msg.sameTab && msg.data && msg.data.to === this.selfPeer) this.serve(msg.peer); }));
    this.unsub.push(room.onConnection((c) => { this.statusText = c ? 'Online' : 'Reconnecting…'; this.refreshUI(); }));
  },

  bindLocal() {
    this.bc = new BroadcastChannel('blocklands-net');
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.peer === this.selfPeer) return;
      if (m.t === 'presence') {
        const isNew = !this.peers.has(m.peer);
        this.onPresence(m.peer, m.data);
        if (isNew) this.maybeServe(m.peer);
      } else if (m.t === 'bye') this.dropPeer(m.peer);
      else if (m.t === 'sync') this.onSync(m.data);
      else if (m.t === 'need' && m.data && m.data.to === this.selfPeer) this.serve(m.peer);
    };
    window.addEventListener('pagehide', () => { if (this.bc) this.bc.postMessage({ t: 'bye', peer: this.selfPeer }); });
  },

  emit(topic, data) {
    if (this.kind === 'room') return this.room.emit(topic, data).catch(() => {});
    if (this.bc) this.bc.postMessage({ t: topic, peer: this.selfPeer, data });
    return Promise.resolve();
  },

  // ------------------------------------------------------------ outgoing ----
  op(o) {
    if (!this.on) return;
    this.seq++;
    this.ops.push([this.seq, ...o]);
    if (this.ops.length > NET_OPS) this.ops.splice(0, this.ops.length - NET_OPS);
    this.sendT = 0;
  },
  edit(x, y, z, id, facing) { if (this.on && this.capture) this.op(['b', x, y, z, id, facing === undefined ? -1 : facing]); },
  explosion(x, y, z, power, seed) { if (this.on && this.capture) this.op(['x', r1(x), r1(y), r1(z), power, seed]); },
  missile(pos, dir, speed) { if (this.on) this.op(['m', r1(pos[0]), r1(pos[1]), r1(pos[2]), r3(dir[0]), r3(dir[1]), r3(dir[2]), Math.round(speed)]); },
  say(text) {
    const t = String(text).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    if (!t || !this.on) return;
    this.op(['c', t]);
    this.addChat(this.name, this.color, t);
  },
  teleported() { this.sendT = 0; },

  presenceData() {
    const p = G.player, v = G.vehicle;
    const d = {
      w: 'bl1', n: this.name, c: this.color,
      p: [r1(p.pos[0]), r1(p.pos[1]), r1(p.pos[2])], r: [r2(p.yaw), r2(p.pitch)],
      a: (p.sneaking ? 1 : 0) | (Act.hand.swinging ? 2 : 0) | (p.parachute ? 4 : 0),
      h: Act.heldId(), s: this.seq, q: this.ops, k: G.settings.skin | 0,
    };
    if (v) d.v = [r1(v.pos[0]), r1(v.pos[1]), r1(v.pos[2]), r3(v.yaw), r3(v.pitch), r3(v.roll), Math.round(v.throttle * 100), v.burner ? 1 : 0, Math.round(v.gear * 100), (v.missiles[0] ? 1 : 0) | (v.missiles[1] ? 2 : 0), G.mouse.left ? 1 : 0, Math.round(v.speed)];
    else d.v = null;
    return d;
  },

  sendPresence(force) {
    const d = this.presenceData();
    let s = JSON.stringify(d);
    // stay inside the 4 KiB presence budget
    while (s.length > 3800 && d.q.length > 4) { d.q = d.q.slice(Math.ceil(d.q.length / 4)); s = JSON.stringify(d); }
    if (!force && s === this.lastSent) return;
    this.lastSent = s;
    if (this.kind === 'room') this.room.presence(d).catch(() => {});
    else if (this.bc) this.bc.postMessage({ t: 'presence', peer: this.selfPeer, data: d });
  },

  update(dt) {
    if (!this.on) return;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 1 / 15; this.sendPresence(false); }
    if (this.kind === 'local') {
      // tabs have no presence service: re-announce and forget silent tabs
      this.beat = (this.beat || 0) - dt;
      if (this.beat <= 0) { this.beat = 1; this.sendPresence(true); }
      const now = performance.now();
      for (const [k, r] of this.peers) if (now - r.seen > 4000) this.dropPeer(k);
    }
    // smooth remote motion
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.peers.values()) {
      for (let i = 0; i < 3; i++) r.pos[i] += (r.tpos[i] - r.pos[i]) * k;
      r.yaw += wrapAngle(r.tyaw - r.yaw) * k;
      r.pitch += (r.tpitch - r.pitch) * k;
      const moved = Math.hypot(r.tpos[0] - r.pos[0], r.tpos[2] - r.pos[2]);
      r.mob.walkAmt += ((moved > 0.02 ? 1 : 0) - r.mob.walkAmt) * k;
      r.mob.walkPhase += dt * 9 * r.mob.walkAmt;
      r.mob.age += dt;
      if (r.jet) {
        const j = r.jet;
        for (let i = 0; i < 3; i++) j.pos[i] += (r.jt.pos[i] - j.pos[i]) * k;
        j.yaw += wrapAngle(r.jt.yaw - j.yaw) * k; j.pitch += (r.jt.pitch - j.pitch) * k; j.roll += wrapAngle(r.jt.roll - j.roll) * k;
        j.basis();
        j.vel = [j.fwd[0] * j.speed, j.fwd[1] * j.speed, j.fwd[2] * j.speed];
        j.blink += dt;
        Vehicles.effects(j, dt);
        if (r.firing) { r.gunT = (r.gunT || 0) - dt; if (r.gunT <= 0) { r.gunT = 0.06; this.remoteTracer(j); } }
      }
    }
    this.drawTags();
  },

  remoteTracer(j) {
    const o = j.toWorld(JET_GUNS[Math.random() < 0.5 ? 0 : 1]);
    const s = 320;
    Vehicles.bullets.push({ pos: o, vel: [j.vel[0] + j.fwd[0] * s, j.vel[1] + j.fwd[1] * s, j.vel[2] + j.fwd[2] * s], life: 1.2, own: false });
  },

  // ------------------------------------------------------------ incoming ----
  onPresence(peer, pr) {
    if (!pr || pr.w !== 'bl1' || !Array.isArray(pr.p)) { if (this.peers.has(peer)) this.dropPeer(peer); return; }
    const pos = pr.p.map(Number);
    if (pos.length !== 3 || !pos.every(Number.isFinite)) return;
    let r = this.peers.get(peer);
    if (!r) {
      r = { peer, pos: pos.slice(), tpos: pos.slice(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, applied: null, jet: null, jt: null, seen: 0, tag: null,
        mob: { type: 'avatar', pos: pos.slice(), h: 1.8, bodyYaw: 0, headYaw: 0, headPitch: 0, walkPhase: 0, walkAmt: 0, hurtTime: 0, dead: false, fuse: 0, age: 0, fire: 0, aiming: 0 } };
      this.peers.set(peer, r);
      G.ui.toast(safeName(pr.n) + ' joined');
      sfx('chime', null, 0.6, 1.2);
    }
    r.seen = performance.now();
    r.name = safeName(pr.n);
    r.color = Number.isInteger(pr.c) ? clamp(pr.c, 0, NET_COLORS.length - 1) : 0;
    r.tpos = pos;
    if (Array.isArray(pr.r)) { r.tyaw = Number(pr.r[0]) || 0; r.tpitch = clamp(Number(pr.r[1]) || 0, -1.6, 1.6); }
    r.flags = pr.a | 0;
    r.held = isItem(pr.h) ? pr.h : 0;
    r.skin = Number.isInteger(pr.k) ? clamp(pr.k, 0, SKINS.length - 1) : 0;
    // aircraft
    const v = Array.isArray(pr.v) && pr.v.length >= 12 && pr.v.every((n) => Number.isFinite(Number(n))) ? pr.v.map(Number) : null;
    if (v) {
      if (!r.jet) { r.jet = new Jet(v[0], v[1], v[2], v[3]); r.jet.remote = true; }
      r.jt = { pos: [v[0], v[1], v[2]], yaw: v[3], pitch: clamp(v[4], -1.6, 1.6), roll: v[5] };
      const j = r.jet;
      j.throttle = clamp(v[6] / 100, 0, 1); j.burner = !!v[7]; j.gear = clamp(v[8] / 100, 0, 1);
      j.missiles = [!!(v[9] & 1), !!(v[9] & 2)]; j.speed = clamp(v[11], 0, 200);
      r.firing = !!v[10];
    } else { r.jet = null; r.jt = null; r.firing = false; }
    // shared ops
    const q = Array.isArray(pr.q) ? pr.q : [];
    const s = Number.isInteger(pr.s) ? pr.s : 0;
    if (r.applied === null) {
      // first sight: their older edits arrive through the sync transfer
      r.applied = s;
      return;
    }
    if (q.length && q[0][0] > r.applied + 1 && s > r.applied) {
      // we missed some: ask them for everything
      this.emit('need', { to: peer });
    }
    for (const o of q) {
      if (!Array.isArray(o) || !(o[0] > r.applied)) continue;
      r.applied = o[0];
      this.applyOp(r, o);
    }
    if (s > r.applied) r.applied = s;
  },

  applyOp(r, o) {
    const kind = o[1];
    const was = this.capture;
    this.capture = false;
    try {
      if (kind === 'b') {
        const [x, y, z, id, f] = [o[2], o[3], o[4], o[5], o[6]].map((n) => Number(n));
        if ([x, y, z].every(Number.isInteger) && y >= 0 && y < CH && (id === 0 || isValidBlock(id)) && Math.abs(x) < 3e5 && Math.abs(z) < 3e5) {
          this.applyEdit(x, y, z, id, [0, 1, 4, 5].includes(f) ? f : undefined);
        }
      } else if (kind === 'x') {
        const [x, y, z, pw, seed] = [o[2], o[3], o[4], o[5], o[6]].map(Number);
        if ([x, y, z, pw, seed].every(Number.isFinite) && pw > 0 && pw <= 6 && G.world.isLoaded(Math.floor(x), Math.floor(z))) explode(x, y, z, pw, null, seed | 0);
      } else if (kind === 'm') {
        const n = o.slice(2, 9).map(Number);
        if (n.every(Number.isFinite)) {
          const d = [n[3], n[4], n[5]], l = Math.hypot(d[0], d[1], d[2]) || 1;
          Vehicles.addRemoteMissile([n[0], n[1], n[2]], d.map((c) => c / l), clamp(n[6], 0, 200));
          sfx('missile', [n[0], n[1], n[2]], 1, 1);
        }
      } else if (kind === 'c' && typeof o[2] === 'string') {
        this.addChat(r.name, r.color, o[2].slice(0, 120));
      }
    } finally { this.capture = was; }
  },

  // A block edit from someone else: apply it now, or remember it for when the chunk loads.
  applyEdit(x, y, z, id, facing) {
    const w = G.world;
    if (w.isLoaded(x, z)) { editBlock(x, y, z, id, facing); return; }
    const key = chunkKey(x >> 4, z >> 4);
    if (!w.edits.has(key)) w.edits.set(key, new Map());
    w.edits.get(key).set(blockIndex(x & 15, y, z & 15), id);
    if (facing !== undefined) w.facing.set(posKey(x, y, z), facing);
    w.editsDirty = true;
  },

  dropPeer(peer) {
    const r = this.peers.get(peer);
    if (!r) return;
    this.peers.delete(peer);
    if (r.tag) r.tag.remove();
    G.ui.toast(r.name + ' left');
  },

  // ------------------------------------------------------------ full sync ----
  // The longest-present player (smallest label) sends the edit history to newcomers.
  maybeServe(newPeer) {
    const others = [...this.peers.keys()].filter((k) => k !== newPeer);
    const me = this.selfPeer;
    if (!me) return;
    if (others.some((k) => k < me)) return;
    setTimeout(() => this.serve(newPeer), 400);
  },

  serve(toPeer) {
    const w = G.world;
    const flat = [];
    for (const [key, m] of w.edits) {
      const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
      for (const [idx, id] of m) {
        const x = cx * CS + (idx % CS), z = cz * CS + (Math.floor(idx / CS) % CS), y = Math.floor(idx / (CS * CS));
        const f = w.facing.get(posKey(x, y, z));
        flat.push(x, y, z, id, f === undefined ? -1 : f);
      }
    }
    const per = 5 * 90;
    const total = Math.max(1, Math.ceil(flat.length / per));
    const id = Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < total; i++) {
      const part = { to: toPeer, id, i, n: total, e: flat.slice(i * per, (i + 1) * per), t: G.dayTime };
      setTimeout(() => this.emit('sync', part), i * 60);
    }
  },

  onSync(d) {
    if (!d || d.to !== this.selfPeer || !Array.isArray(d.e)) return;
    const was = this.capture;
    this.capture = false;
    try {
      for (let i = 0; i + 4 < d.e.length; i += 5) {
        const [x, y, z, id, f] = d.e.slice(i, i + 5).map(Number);
        if (![x, y, z].every(Number.isInteger) || y < 0 || y >= CH || !(id === 0 || isValidBlock(id))) continue;
        if (G.world.getBlock(x, y, z) === id && G.world.isLoaded(x, z)) continue;
        this.applyEdit(x, y, z, id, [0, 1, 4, 5].includes(f) ? f : undefined);
      }
      if (d.i === 0 && Number.isFinite(d.t)) G.dayTime = ((d.t % 1) + 1) % 1;
    } finally { this.capture = was; }
  },

  // ------------------------------------------------------------ rendering ----
  render(cp) {
    if (!this.on) return;
    for (const r of this.peers.values()) {
      if (r.jet) { Vehicles.renderJet(r.jet.state, cp, false); continue; }
      const m = r.mob;
      m.pos = r.pos;
      m.bodyYaw = r.yaw + Math.PI;
      m.headYaw = m.bodyYaw;
      m.headPitch = -r.pitch;
      m.tint = NET_COLORS[r.color].map((c) => c / 255 * 1.1);
      m.skin = r.skin || 0;
      ER.mob(null, m, cp);
      if (r.flags & 4) ER.parachute(r.pos, cp);
    }
  },

  // name tags projected over each remote player
  drawTags() {
    const host = $('nametags');
    const R = G.renderer;
    if (!R || !R.viewProj) return;
    const vp = R.viewProj, cam = R.camPos;
    const W = window.innerWidth, H = window.innerHeight;
    for (const r of this.peers.values()) {
      if (!r.tag) {
        r.tag = document.createElement('div');
        r.tag.className = 'ntag';
        host.append(r.tag);
      }
      const base = r.jet ? [r.jet.pos[0], r.jet.pos[1] + 3.5, r.jet.pos[2]] : [r.pos[0], r.pos[1] + 2.25, r.pos[2]];
      const rel = [base[0] - cam[0], base[1] - cam[1], base[2] - cam[2]];
      const w = vp[3] * rel[0] + vp[7] * rel[1] + vp[11] * rel[2] + vp[15];
      const dist = Math.hypot(rel[0], rel[1], rel[2]);
      if (w < 0.1 || dist > 300 || G.hudHidden) { r.tag.style.display = 'none'; continue; }
      const x = ((vp[0] * rel[0] + vp[4] * rel[1] + vp[8] * rel[2] + vp[12]) / w * 0.5 + 0.5) * W;
      const y = (1 - ((vp[1] * rel[0] + vp[5] * rel[1] + vp[9] * rel[2] + vp[13]) / w * 0.5 + 0.5)) * H;
      r.tag.style.display = '';
      r.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      const label = r.name + (r.jet ? ' ✈' : '') + (dist > 40 ? ' · ' + Math.round(dist) + ' m' : '');
      if (r.tag.textContent !== label) r.tag.textContent = label;
      r.tag.style.setProperty('--c', 'rgb(' + NET_COLORS[r.color].join(',') + ')');
    }
  },

  // ------------------------------------------------------------ chat & UI ----
  addChat(name, color, text) {
    const log = $('chatLog');
    const line = document.createElement('div');
    line.className = 'cline';
    const b = document.createElement('b');
    b.textContent = name;
    b.style.color = 'rgb(' + NET_COLORS[color].join(',') + ')';
    line.append(b, document.createTextNode(' ' + text));
    log.append(line);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 9000);
    sfx('click', null, 0.8, 1);
  },

  openChat() {
    if (!this.on) return;
    const box = $('chatInput');
    box.classList.remove('hidden');
    box.value = '';
    releaseAllInput();
    setTimeout(() => box.focus(), 0);
  },

  refreshUI() {
    const st = $('mpStatus');
    if (!st) return;
    const btn = $('mpJoinBtn');
    if (!this.available) {
      st.textContent = 'Checking for other players…';
      btn.disabled = true;
    } else {
      btn.disabled = false;
      btn.textContent = this.on ? 'Leave online world' : 'Join online world';
      const where = this.kind === 'room' ? 'Everyone who opens this page (share it from the Share menu) plays in the same world.' : 'Not inside claude.ai: open this page in another tab of this browser to play together.';
      st.textContent = this.on ? (this.statusText || 'Online') + ' · ' + (this.peers.size + 1) + ' player' + (this.peers.size ? 's' : '') + ' here' : where;
    }
    $('mpName').value = this.name;
    document.querySelectorAll('#mpColors button').forEach((b, i) => b.classList.toggle('on', i === this.color));
    const pl = $('playerList');
    if (pl) {
      pl.innerHTML = '';
      if (this.on) {
        const add = (n, c, you) => { const d = document.createElement('div'); const dot = document.createElement('i'); dot.style.background = 'rgb(' + NET_COLORS[c].join(',') + ')'; d.append(dot, document.createTextNode(n + (you ? ' (you)' : ''))); pl.append(d); };
        add(this.name, this.color, true);
        for (const r of this.peers.values()) add(r.name, r.color, false);
      }
    }
  },
};

function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function safeName(n) { const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16); return s || 'Player'; }
