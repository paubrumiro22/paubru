'use strict';
// Online play, two flavours:
// - Servers: anyone creates one and gets a 6-letter code (and an invite link). Players connect
//   straight to each other with WebRTC through Trystero (public Nostr relays only introduce
//   them; no server of ours). The world lives in the browser of everyone who has played on it:
//   each player keeps a copy with the time of every block edit, and when players meet they swap
//   histories and keep the newest version of each block. So the world is saved as long as any
//   of its players still has their copy, and anyone can open it again.
// - The shared "online world" inside a claude.ai artifact (its "room" presence + events), or a
//   BroadcastChannel between tabs of one browser.
// Each player publishes a small presence object (position, look, aircraft, the last few block
// edits / explosions as numbered "ops"); full histories travel over "sync". Mobs stay local.

const ONLINE_SEED = 20250925;
const ONLINE_SAVE_KEY = 'blocklands.online.v1';
const NET_KEY = 'blocklands.net.v1';
const SERVERS_KEY = 'blocklands.servers.v1';
const SERVER_SAVE_PREFIX = 'blocklands.srv.';
const SERVER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NET_APP_ID = 'blocklands-paubru-v1';
const TRYSTERO_URL = 'https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm';
const NET_OPS = 80;               // ops kept in presence (edits, explosions, missiles, chat)
const NET_COLORS = [[230, 72, 60], [60, 140, 240], [70, 200, 90], [240, 190, 40], [190, 90, 230], [40, 200, 200], [250, 130, 40], [240, 110, 170]];

let trysteroLoad = null;
function loadTrystero() {
  if (!trysteroLoad) trysteroLoad = import(TRYSTERO_URL).catch((e) => { trysteroLoad = null; throw e; });
  return trysteroLoad;
}

function normServerCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 6 && [...c].every((ch) => SERVER_CODE_CHARS.includes(ch)) ? c : null;
}
function newServerCode() {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return [...a].map((n) => SERVER_CODE_CHARS[n % SERVER_CODE_CHARS.length]).join('');
}
// The world seed comes from the code, so nobody has to send it.
function serverSeed(code) {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return (h ^ (h >>> 13)) & 0x7fffffff;
}
function serverLink(code) { return location.origin + location.pathname + '#s=' + code; }
const nowSec = () => Math.floor(Date.now() / 1000);

const Net = {
  available: false, kind: null, on: false, room: null, bc: null,
  selfPeer: null, name: '', color: 0,
  peers: new Map(),            // peer -> remote player state
  ops: [], seq: 0, capture: true,
  sendT: 0, lastSent: '', chat: [], statusText: '',
  syncBuf: new Map(),
  server: null,                // the server being played ({ code, name, mode, last }) or null
  servers: [],                 // servers this browser knows
  p2p: null, p2pToken: 0,
  times: new Map(),            // posKey -> time (s) of the latest edit of that block

  async init() {
    const saved = storageGet(NET_KEY) || {};
    this.name = typeof saved.name === 'string' && saved.name.trim() ? saved.name.slice(0, 16) : 'Player' + Math.floor(100 + Math.random() * 900);
    this.color = Number.isInteger(saved.color) ? clamp(saved.color, 0, NET_COLORS.length - 1) : Math.floor(Math.random() * NET_COLORS.length);
    this.loadServers();
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

  // ------------------------------------------------------------ servers ----
  loadServers() {
    const list = storageGet(SERVERS_KEY);
    this.servers = Array.isArray(list) ? list.filter((s) => s && normServerCode(s.code)).map((s) => ({
      code: s.code, name: safeServerName(s.name, s.code), mode: s.mode === 'creative' ? 'creative' : 'survival', last: Number(s.last) || 0, named: !!s.named,
    })) : [];
  },
  saveServers() { storageSet(SERVERS_KEY, this.servers); },
  findServer(code) { return this.servers.find((s) => s.code === code) || null; },

  createServer(name, mode) {
    const code = newServerCode();
    const s = { code, name: safeServerName(name, code), mode: mode === 'creative' ? 'creative' : 'survival', last: nowSec(), named: true };
    this.servers.push(s);
    this.saveServers();
    this.join(s);
    return s;
  },

  joinCode(raw) {
    const code = normServerCode(raw);
    if (!code) { G.ui.toast('A server code has 6 letters and numbers, like K7P2QX'); return false; }
    let s = this.findServer(code);
    if (!s) { s = { code, name: 'Server ' + code, mode: 'survival', last: nowSec(), named: false }; this.servers.push(s); this.saveServers(); }
    this.join(s);
    return true;
  },

  forgetServer(code) {
    if (this.server && this.server.code === code) this.leave();
    this.servers = this.servers.filter((s) => s.code !== code);
    this.saveServers();
    try { localStorage.removeItem(SERVER_SAVE_PREFIX + code); } catch (e) { /* ignore */ }
    this.refreshUI();
  },

  // A code in the address (#s=K7P2QX) means "join this server".
  codeFromLink() {
    const m = /(?:^|[#&])s=([A-Za-z0-9-]{6,8})/.exec(location.hash || '');
    return m ? normServerCode(m[1]) : null;
  },

  saveKey() { return this.server ? SERVER_SAVE_PREFIX + this.server.code : ONLINE_SAVE_KEY; },
  serializeTimes() {
    const a = [];
    for (const [k, t] of this.times) a.push(k, t);
    return a;
  },
  loadTimes(a) {
    this.times.clear();
    if (!Array.isArray(a)) return;
    for (let i = 0; i + 1 < a.length; i += 2) if (Number.isFinite(a[i]) && Number.isFinite(a[i + 1])) this.times.set(a[i], a[i + 1]);
  },

  // ------------------------------------------------------------ session ----
  // server: a server record (P2P), or nothing for the shared claude.ai / tabs world
  join(server) {
    if (!server && !this.available) return;
    if (this.on) {
      if (server && this.server && server.code === this.server.code) return;
      this.leave(true);   // saves the world being left
    } else saveWorld();
    this.server = server || null;
    this.on = true;
    G.online = true;
    this.ops = []; this.seq = 0; this.peers.clear(); this.syncBuf.clear(); this.times.clear();
    const save = storageGet(this.saveKey());
    const ok = save && save.v === 2 ? save : null;
    // everyone on a server must generate the same terrain: servers always use the latest generator
    if (ok && server) ok.gen = GEN_LATEST;
    newWorld(server ? serverSeed(server.code) : ONLINE_SEED, ok, { mode: server ? server.mode : G.mode, type: 'default', gen: server ? GEN_LATEST : 1 });
    if (ok) this.loadTimes(ok.net);
    prepareArea(G.player.pos[0], G.player.pos[2], 2);
    liftOutOfBlocks(G.player);
    // background tabs pause animation frames: keep announcing from a timer
    clearInterval(this.hb);
    this.hb = setInterval(() => { if (this.on) this.sendPresence(this.kind === 'local' || !!this.server); }, 1000);
    document.body.classList.add('online');
    if (server) {
      server.last = nowSec();
      this.saveServers();
      try { history.replaceState(null, '', '#s=' + server.code); } catch (e) { /* ignore */ }
      this.statusText = 'Connecting…';
      this.startP2P(server);
      G.ui.toast('Server “' + server.name + '” · code ' + server.code);
    } else {
      this.statusText = 'Online';
      if (this.kind === 'room') this.bindRoom();
      else this.bindLocal();
      this.sendPresence(true);
      G.ui.toast('Joined the online world as ' + this.name);
    }
    saveWorld();
    this.refreshUI();
  },

  // switching: another world is loaded right after, so do not go back to your own one
  leave(switching) {
    if (!this.on) return;
    saveWorld();
    this.on = false;
    G.online = false;
    clearInterval(this.hb);
    if (this.unsub) for (const u of this.unsub) try { u(); } catch (e) { /* ignore */ }
    this.unsub = [];
    if (this.room && !this.server) this.room.presence({ w: null, p: null, v: null, q: null }).catch(() => {});
    if (this.bc) { this.bc.postMessage({ t: 'bye', peer: this.selfPeer }); this.bc.close(); this.bc = null; }
    this.p2pToken++;
    if (this.p2p) { const r = this.p2p.room; this.p2p = null; r.leave().catch(() => {}); }
    for (const r of this.peers.values()) if (r.tag) r.tag.remove();
    this.peers.clear();
    const wasServer = this.server;
    this.server = null;
    this.times.clear();
    if (wasServer) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    document.body.classList.remove('online');
    if (switching) return;
    const save = loadSave();
    newWorld(save ? save.seed : (Math.random() * 2147483647) | 0, save, { mode: 'survival', type: 'default' });
    prepareArea(G.player.pos[0], G.player.pos[2], 2);
    this.refreshUI();
    G.ui.toast('Back to your own world');
  },

  async startP2P(server) {
    const token = ++this.p2pToken;
    let mod;
    try {
      mod = await loadTrystero();
    } catch (e) {
      console.warn('Blocklands: could not load the networking library', e);
      if (token === this.p2pToken) { this.statusText = 'Offline: could not reach the network (you can keep playing, it saves here)'; this.refreshUI(); }
      return;
    }
    if (!this.on || this.server !== server || token !== this.p2pToken) return;
    try {
      const room = mod.joinRoom({ appId: NET_APP_ID, password: 'bl:' + server.code }, 'srv-' + server.code);
      this.selfPeer = mod.selfId;
      const pres = room.makeAction('pres'), sync = room.makeAction('sync'), need = room.makeAction('need');
      pres.onMessage = (d, ctx) => {
        const isNew = !this.peers.has(ctx.peerId);
        this.onPresence(ctx.peerId, d);
        if (isNew && this.peers.has(ctx.peerId)) this.refreshUI();
      };
      sync.onMessage = (d, ctx) => this.onSync(d, ctx.peerId);
      need.onMessage = (d, ctx) => this.serve(ctx.peerId);
      room.onPeerJoin = (id) => {
        this.sendPresence(true, id);
        // both sides send their whole history: each keeps the newest version of every block
        setTimeout(() => this.serve(id), 300);
      };
      room.onPeerLeave = (id) => { this.dropPeer(id); this.refreshUI(); };
      this.p2p = { room, pres, sync, need };
      this.statusText = 'Online';
      this.sendPresence(true);
    } catch (e) {
      console.warn('Blocklands: could not open the server', e);
      this.statusText = 'Offline: could not open the connection (you can keep playing, it saves here)';
    }
    this.refreshUI();
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

  emit(topic, data, to) {
    if (this.server) {
      const a = this.p2p && this.p2p[topic];
      return a ? a.send(data, to ? { target: to } : undefined).catch(() => {}) : Promise.resolve();
    }
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
  edit(x, y, z, id, facing) {
    if (!this.on) return;
    this.times.set(posKey(x, y, z), nowSec());
    if (this.capture) this.op(['b', x, y, z, id, facing === undefined ? -1 : facing]);
  },
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

  sendPresence(force, to) {
    const d = this.presenceData();
    let s = JSON.stringify(d);
    // stay inside the 4 KiB presence budget
    while (s.length > 3800 && d.q.length > 4) { d.q = d.q.slice(Math.ceil(d.q.length / 4)); s = JSON.stringify(d); }
    if (!force && s === this.lastSent) return;
    this.lastSent = s;
    if (this.server) { if (this.p2p) this.p2p.pres.send(d, to ? { target: to } : undefined).catch(() => {}); }
    else if (this.kind === 'room') this.room.presence(d).catch(() => {});
    else if (this.bc) this.bc.postMessage({ t: 'presence', peer: this.selfPeer, data: d });
  },

  update(dt) {
    if (!this.on) return;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 1 / 15; this.sendPresence(false); }
    if (this.kind === 'local' || this.server) {
      // tabs and P2P have no presence service: re-announce and forget silent players
      this.beat = (this.beat || 0) - dt;
      if (this.beat <= 0) { this.beat = 1; this.sendPresence(true); }
      const now = performance.now(), limit = this.server ? 9000 : 4000;
      for (const [k, r] of this.peers) if (now - r.seen > limit) { this.dropPeer(k); this.refreshUI(); }
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
      this.emit('need', { to: peer }, peer);
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
          this.applyEdit(x, y, z, id, validFacing(f) ? f : undefined);
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
    this.times.set(posKey(x, y, z), nowSec());
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

  // Servers send [x, y, z, id, facing, time] per edited block; the shared world omits the time.
  serve(toPeer) {
    if (!this.on) return;
    const w = G.world, timed = !!this.server, k = timed ? 6 : 5;
    const flat = [];
    for (const [key, m] of w.edits) {
      const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
      for (const [idx, id] of m) {
        const x = cx * CS + (idx % CS), z = cz * CS + (Math.floor(idx / CS) % CS), y = Math.floor(idx / (CS * CS));
        const pk = posKey(x, y, z);
        const f = w.facing.get(pk);
        flat.push(x, y, z, id, f === undefined ? -1 : f);
        if (timed) flat.push(this.times.get(pk) || 0);
      }
    }
    const per = k * (timed ? 2000 : 90);
    const total = Math.max(1, Math.ceil(flat.length / per));
    const id = Math.random().toString(36).slice(2, 8);
    const meta = this.server && this.server.named ? { name: this.server.name, mode: this.server.mode } : null;
    for (let i = 0; i < total; i++) {
      const part = { to: toPeer, id, i, n: total, k, e: flat.slice(i * per, (i + 1) * per), t: G.dayTime };
      if (i === 0 && meta) part.m = meta;
      setTimeout(() => this.emit('sync', part, toPeer), i * 60);
    }
  },

  onSync(d, from) {
    if (!d || d.to !== this.selfPeer || !Array.isArray(d.e)) return;
    const k = d.k === 6 ? 6 : 5, timed = k === 6 && !!this.server;
    const was = this.capture;
    this.capture = false;
    let changed = 0;
    try {
      for (let i = 0; i + k - 1 < d.e.length; i += k) {
        const [x, y, z, id, f] = d.e.slice(i, i + 5).map(Number);
        if (![x, y, z].every(Number.isInteger) || y < 0 || y >= CH || !(id === 0 || isValidBlock(id))) continue;
        const pk = posKey(x, y, z);
        const t = timed ? Number(d.e[i + 5]) || 0 : 0;
        // keep whichever version of this block changed last
        if (timed && t <= (this.times.get(pk) || 0)) continue;
        if (G.world.getBlock(x, y, z) !== id || !G.world.isLoaded(x, z)) { this.applyEdit(x, y, z, id, validFacing(f) ? f : undefined); changed++; }
        if (timed) this.times.set(pk, t);
      }
      if (d.i === 0) {
        // one clock for everybody: the player with the smaller id sets the time of day
        if (Number.isFinite(d.t) && (!this.server || !from || from < this.selfPeer)) G.dayTime = ((d.t % 1) + 1) % 1;
        const s = this.server;
        if (s && d.m && typeof d.m.name === 'string' && !s.named) {
          s.name = safeServerName(d.m.name, s.code); s.named = true;
          if ((d.m.mode === 'creative' || d.m.mode === 'survival') && d.m.mode !== s.mode) {
            // first visit: start in the mode the server was created with
            s.mode = d.m.mode;
            setGameMode(s.mode);
            refreshGameUI();
          }
          this.saveServers();
          this.refreshUI();
        }
      }
    } finally { this.capture = was; }
    if (changed && this.server) G.world.editsDirty = true;
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
  buildServerList() {
    const host = $('srvList');
    if (!host) return;
    host.innerHTML = '';
    const list = this.servers.slice().sort((a, b) => b.last - a.last);
    for (const s of list) {
      const here = !!this.server && this.server.code === s.code;
      const row = document.createElement('div');
      row.className = 'srv' + (here ? ' on' : '');
      const info = document.createElement('div');
      const n = document.createElement('b');
      n.textContent = s.name;
      const sub = document.createElement('span');
      sub.textContent = s.code + ' · ' + (s.mode === 'creative' ? 'Creative' : 'Survival') + (s.last ? ' · ' + timeAgo(s.last) : '');
      info.append(n, sub);
      row.append(info);
      const play = document.createElement('button');
      play.textContent = here ? 'Playing' : 'Play';
      play.disabled = here;
      play.className = here ? '' : 'primary';
      play.addEventListener('click', () => { Sound.init(); this.join(s); refreshGameUI(); requestLock(); });
      const forget = document.createElement('button');
      forget.textContent = 'Delete';
      forget.title = 'Delete your copy of this world from this device';
      let armed = 0;
      forget.addEventListener('click', () => {
        if (!armed) {
          forget.textContent = 'Delete my copy?';
          armed = setTimeout(() => { armed = 0; forget.textContent = 'Delete'; }, 4000);
          return;
        }
        clearTimeout(armed);
        this.forgetServer(s.code);
        refreshGameUI();
      });
      row.append(play, forget);
      host.append(row);
    }
  },

  copyInvite() {
    if (!this.server) return;
    const link = serverLink(this.server.code);
    const done = () => G.ui.toast('Invite link copied · code ' + this.server.code);
    const fallback = () => {
      const i = $('srvLink');
      i.value = link;
      i.classList.remove('hidden');
      i.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      if (ok) done(); else G.ui.toast('Copy the link from the box');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fallback);
    else fallback();
  },

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
    const players = (this.peers.size + 1) + ' player' + (this.peers.size ? 's' : '');
    // the shared claude.ai world (only offered where the artifact room exists)
    const btn = $('mpJoinBtn');
    const shared = this.kind === 'room';
    btn.classList.toggle('hidden', !shared);
    btn.disabled = !this.available;
    btn.textContent = this.on && !this.server ? 'Leave shared world' : 'Join shared world';
    // the server you are on
    const cur = $('srvCurrent');
    cur.classList.toggle('hidden', !this.server);
    if (this.server) {
      $('srvCurName').textContent = this.server.name;
      $('srvCurCode').textContent = this.server.code;
      $('srvCurInfo').textContent = (this.statusText || 'Online') + ' · ' + players;
    }
    if (this.on && !this.server) st.textContent = (this.statusText || 'Online') + ' · ' + players + ' in the shared world';
    else if (this.server) st.textContent = 'Send the code or the invite link to your friends. The world saves on every player’s device, so anyone who played here can open it again.';
    else st.textContent = 'Create a server and share its code, or type a friend’s code. No account needed.';
    this.buildServerList();
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
function safeServerName(n, code) { const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24); return s || 'Server ' + code; }
function timeAgo(sec) {
  const d = Math.max(0, nowSec() - sec);
  if (d < 90) return 'just now';
  if (d < 5400) return Math.round(d / 60) + ' min ago';
  if (d < 129600) return Math.round(d / 3600) + ' h ago';
  return Math.round(d / 86400) + ' days ago';
}
function safeName(n) { const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16); return s || 'Player'; }
