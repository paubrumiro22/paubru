'use strict';
// People: friends and running a server.
// - Friends: add someone from their right-click menu (they accept), or from the People panel
//   (O). The panel shows where your friends are (the part of town, how far, which way), when
//   they were last seen and on which server, and lets you ask to teleport to them or invite them
//   to you: nothing happens until the other one accepts (Y / N or the buttons on the card).
// - Server admin: whoever created a server owns it (else the first to claim it). Owners can
//   make other admins, kick players, ban them, mute their chat, say who may build (everyone or
//   only members) and whether fights are allowed, and make backups of the world that they can
//   bring back later (every block that changed since is put back and shared like any edit).
//   It is enforced by every player's game: nobody applies the edits of a banned player or of a
//   visitor when only members build, nor the chat of a muted one.

const FRIENDS_KEY = 'blocklands.friends.v1';
const ADMIN_KEY = 'blocklands.admin.';
const BACKUPS_KEY = 'blocklands.backups.';
const BACKUP_PREFIX = 'blocklands.srv.backup.';

const Friends = {
  list: [],
  load() {
    const d = storageGet(FRIENDS_KEY);
    this.list = Array.isArray(d) ? d.filter((f) => f && typeof f.o === 'string' && /^o[a-z0-9]{8,14}$/.test(f.o)).slice(0, 100) : [];
  },
  save() { storageSet(FRIENDS_KEY, this.list); },
  get(o) { return this.list.find((f) => f.o === o) || null; },
  add(o, name) {
    if (!o || o === Net.owner) return;
    let f = this.get(o);
    if (!f) { f = { o, n: name, since: Date.now() }; this.list.push(f); }
    f.n = name || f.n;
    this.save();
  },
  remove(o) { this.list = this.list.filter((f) => f.o !== o); this.save(); },
  peerOf(o) { for (const r of Net.peers.values()) if (r.owner === o) return r; return null; },
  // remember where friends were last seen
  update(dt) {
    this.t = (this.t || 0) - dt;
    if (this.t > 0 || !Net.on) return;
    this.t = 5;
    let dirty = false;
    for (const f of this.list) {
      const r = this.peerOf(f.o);
      if (!r) continue;
      f.seen = Date.now(); f.n = r.name; f.srv = Net.server ? Net.server.name : 'Online world'; f.code = Net.server ? Net.server.code : null;
      f.where = People.where(r.pos);
      dirty = true;
    }
    if (dirty) this.save();
  },
};

// ---------------------------------------------------------------- questions with Y / N ----
const Ask = {
  list: [],
  show(text, onYes, onNo, secs = 25) {
    let box = $('askBox');
    if (!box) { box = document.createElement('div'); box.id = 'askBox'; document.body.append(box); }
    const q = { text, onYes, onNo, until: performance.now() + secs * 1000, el: document.createElement('div') };
    q.el.className = 'ask';
    q.el.innerHTML = `<div class="ask-t"></div><div class="ask-b"><button class="gp-btn ok">✓ Accept <kbd>Y</kbd></button><button class="gp-btn">✕ <kbd>N</kbd></button></div><i class="ask-bar"></i>`;
    q.el.querySelector('.ask-t').textContent = text;
    q.el.querySelector('.ask-bar').style.animationDuration = secs + 's';
    q.el.querySelector('.ok').addEventListener('click', () => this.answer(q, true));
    q.el.querySelector('.gp-btn:not(.ok)').addEventListener('click', () => this.answer(q, false));
    box.append(q.el);
    this.list.push(q);
    sfx('chime', null, 0.7, 1.5);
    q.timer = setTimeout(() => this.answer(q, false, true), secs * 1000);
  },
  answer(q, yes, timeout) {
    if (!this.list.includes(q)) return;
    this.list = this.list.filter((x) => x !== q);
    clearTimeout(q.timer);
    q.el.classList.add('out');
    setTimeout(() => q.el.remove(), 250);
    try { if (yes) q.onYes(); else if (q.onNo) q.onNo(timeout); } catch (e) { console.warn(e); }
  },
};
window.addEventListener('keydown', (e) => {
  if (!Ask.list.length || e.repeat || G.screenOpen || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
  if (e.code === 'KeyY' || e.code === 'KeyN') { e.preventDefault(); e.stopImmediatePropagation(); Ask.answer(Ask.list[0], e.code === 'KeyY'); }
}, true);

// ---------------------------------------------------------------- server admin ----
const Admin = {
  st: null, code: null,
  blank() { return { own: [], nm: {}, ban: {}, mute: [], mem: [], build: 'all', pvp: true }; },
  state() {
    const code = Net.server ? Net.server.code : null;
    if (code !== this.code) {
      this.code = code;
      const s = code ? storageGet(ADMIN_KEY + code) : null;
      this.st = Object.assign(this.blank(), s && typeof s === 'object' ? s : {});
    }
    return this.st || (this.st = this.blank());
  },
  on() { return !!(Net.on && Net.server); },
  isOwner(o) { const s = this.state(); return s.own.includes(o); },
  amAdmin() { return !this.on() || this.isOwner(Net.owner); },
  canBuild(o) {
    if (!this.on()) return true;
    const s = this.state();
    if (s.ban[o]) return false;
    return s.build !== 'members' || s.own.includes(o) || s.mem.includes(o);
  },
  role(o) { const s = this.state(); return s.own.includes(o) ? 'admin' : s.mem.includes(o) ? 'member' : s.ban[o] ? 'banned' : 'visitor'; },
  save() { if (this.code) storageSet(ADMIN_KEY + this.code, this.st); },
  share() { this.save(); SharedState.put('admin', this.st); },
  // changes from another player count only when they come from an admin (or claim an empty server)
  apply(v, fromShared) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.own)) return;
    const s = this.state();
    const clean = {
      own: v.own.filter((o) => typeof o === 'string').slice(0, 16), nm: v.nm && typeof v.nm === 'object' ? v.nm : {},
      ban: v.ban && typeof v.ban === 'object' ? v.ban : {}, mute: Array.isArray(v.mute) ? v.mute.slice(0, 64) : [],
      mem: Array.isArray(v.mem) ? v.mem.slice(0, 200) : [], build: v.build === 'members' ? 'members' : 'all', pvp: v.pvp !== false,
    };
    Object.assign(s, clean);
    this.save();
    if (fromShared && s.ban[Net.owner]) this.kicked('You are banned from this server');
    People.refresh();
  },
  claim() {
    const s = this.state();
    if (s.own.length) return false;
    s.own.push(Net.owner); s.nm[Net.owner] = Net.name;
    this.share();
    G.ui.toast('👑 You own this server now');
    return true;
  },
  set(fn) { if (!this.amAdmin()) return; fn(this.state()); this.share(); People.refresh(); },
  kick(r, ban) {
    if (!this.amAdmin() || !r || !r.owner) return;
    if (ban) this.set((s) => { s.ban[r.owner] = r.name; s.own = s.own.filter((o) => o !== r.owner); s.mem = s.mem.filter((o) => o !== r.owner); });
    Net.sendSoc(r.peer, { k: 'kick', ban: !!ban, by: Net.name });
    Net.say((ban ? '⛔ ' : '👢 ') + r.name + (ban ? ' was banned' : ' was kicked') + ' by ' + Net.name);
  },
  kicked(msg) {
    if (!Net.on || !Net.server) return;
    const name = Net.server.name;
    GPanel.closeAll();
    Net.leave();
    G.ui.banner('⛔', msg + ' · ' + name);
  },

  // ---- backups: a copy of the world's blocks in this browser ----
  backups() { const l = this.code && storageGet(BACKUPS_KEY + this.code); return Array.isArray(l) ? l : []; },
  async backup(auto) {
    if (!this.on() || !G.world) return;
    const code = Net.server.code, ts = Date.now();
    const data = { v: 1, edits: G.world.serializeEdits(), facing: G.world.serializeExtras().facing };
    const n = Object.values(data.edits).reduce((a, x) => a + x.length / 2, 0);
    storageSet(BACKUP_PREFIX + code + '.' + ts, data);
    let list = this.backups();
    list.push({ ts, n, auto: !!auto, by: Net.name });
    // keep the 8 newest, and never more than 3 automatic ones
    const autos = list.filter((b) => b.auto);
    while (autos.length > 3) { const o = autos.shift(); list = list.filter((b) => b !== o); this.dropData(code, o.ts); }
    while (list.length > 8) { const o = list.shift(); this.dropData(code, o.ts); }
    storageSet(BACKUPS_KEY + code, list);
    if (!auto) G.ui.toast('💾 Backup saved (' + n + ' changed blocks)');
    People.refresh();
  },
  dropData(code, ts) { const k = BACKUP_PREFIX + code + '.' + ts; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } if (Saves.ok) Saves.del(k); },
  // put back every block that differs from the backup; blocks placed since then go
  restore(ts) {
    if (!this.amAdmin()) return;
    const data = storageGet(BACKUP_PREFIX + this.code + '.' + ts);
    if (!data || !data.edits) { G.ui.toast('That backup is not in this browser'); return; }
    const w = G.world, want = new Map(), fac = new Map();
    for (let i = 0; i + 1 < (data.facing || []).length; i += 2) fac.set(data.facing[i], data.facing[i + 1]);
    const each = (edits, fn) => {
      for (const k of Object.keys(edits)) {
        const key = Number(k), cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768, arr = edits[k];
        for (let i = 0; i + 1 < arr.length; i += 2) {
          const idx = arr[i], x = idx % CS, z = Math.floor(idx / CS) % CS, y = Math.floor(idx / (CS * CS));
          fn(cx * CS + x, y, cz * CS + z, arr[i + 1]);
        }
      }
    };
    each(data.edits, (x, y, z, id) => want.set(posKey(x, y, z), [x, y, z, id]));
    const list = [];
    each(w.serializeEdits(), (x, y, z, id) => { if (!want.has(posKey(x, y, z)) && id !== B.AIR) list.push([x, y, z, B.AIR]); });
    for (const [pk, [x, y, z, id]] of want) {
      if (w.getBlock(x, y, z) === id && (!fac.has(pk) || w.getFacing(x, y, z) === fac.get(pk))) continue;
      list.push(fac.has(pk) ? [x, y, z, id, fac.get(pk)] : [x, y, z, id]);
    }
    if (!list.length) { G.ui.toast('Nothing to restore: the world matches the backup'); return; }
    for (let i = 0; i < list.length; i += 4000) editBlocks(list.slice(i, i + 4000));
    Net.say('💾 ' + Net.name + ' restored a backup (' + list.length + ' blocks)');
  },
  update(dt) {
    if (!this.on()) return;
    const s = this.state();
    // the creator of a server claims it once the shared state has had time to arrive
    this.claimT = (this.claimT || 0) + dt;
    if (!s.own.length && Net.server.mine && this.claimT > 8 && (SharedState.loaded || this.claimT > 20)) this.claim();
    // owners keep an automatic backup every 20 minutes of play
    if (this.amAdmin() && s.own.length) {
      this.autoT = (this.autoT || 0) + dt;
      if (this.autoT > 1200) { this.autoT = 0; this.backup(true); }
    }
  },
};

// ---------------------------------------------------------------- the People panel ----
const People = {
  p: null, tab: 'online',
  where(pos) {
    if (!pos) return '';
    const g = G.world && G.world.gen;
    let st = null;
    try { st = g && typeof stucomVillage === 'function' ? stucomVillage(g) : null; } catch (e) { st = null; }
    let place = '';
    if (st) {
      const dx = pos[0] - st.x, dz = pos[2] - st.z, d = Math.hypot(dx, dz);
      if (d < 22) place = 'Plaça de STUCOM';
      else if (d < 95) place = 'STUCOM district';
      else {
        const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((Math.atan2(dx, -dz) / (Math.PI / 4) + 8)) % 8];
        place = (d >= 1000 ? (d / 1000).toFixed(1) + ' km ' : Math.round(d) + ' m ') + dir + ' of STUCOM';
      }
    }
    const h = G.world && G.world.surfaceHeight ? G.world.surfaceHeight(Math.floor(pos[0]), Math.floor(pos[2])) : -1;
    if (h > 0 && pos[1] < h - 6) place += place ? ' · underground' : 'Underground';
    return place || Math.round(pos[0]) + ', ' + Math.round(pos[2]);
  },
  dist(pos) {
    const p = G.player.pos, d = Math.hypot(pos[0] - p[0], pos[2] - p[2]);
    const a = Math.atan2(pos[0] - p[0], -(pos[2] - p[2])) - (-G.player.yaw);
    const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
    const rel = Math.atan2(pos[0] - p[0], pos[2] - p[2]);
    const look = Math.atan2(-Math.sin(G.player.yaw), -Math.cos(G.player.yaw));
    let k = rel - look; while (k < -Math.PI) k += 2 * Math.PI; while (k > Math.PI) k -= 2 * Math.PI;
    void a;
    return (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km') + ' ' + arrows[(Math.round(-k / (Math.PI / 4)) + 8) % 8];
  },
  open(tab) {
    if (this.p) { this.p.close(); return; }
    if (tab) this.tab = tab;
    this.p = GPanel.open({ title: 'People', icon: '👥', width: 560, onClose: () => { this.p = null; clearInterval(this.iv); } });
    this.render();
    this.iv = setInterval(() => this.render(true), 1500);
  },
  refresh() { if (this.p) this.render(); },
  render(soft) {
    const p = this.p;
    if (!p) return;
    if (soft && p.body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const e = GPanel.esc, srv = Admin.on();
    p.setSub(Net.on ? (Net.server ? Net.server.name + ' · ' + Net.server.code : 'Online world') + ' · ' + (Net.peers.size + 1) + ' online' : 'Playing alone');
    const tabs = [['online', 'Online now'], ['friends', 'Friends (' + Friends.list.length + ')']];
    if (srv) tabs.push(['admin', Admin.amAdmin() ? '👑 Server' : 'Server']);
    let html = `<div class="gp-tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const me = Admin.amAdmin() && srv;
    const row = (r, f) => {
      const fr = r && r.owner && Friends.get(r.owner);
      const role = srv && r && r.owner ? Admin.role(r.owner) : '';
      const dot = `<span class="pp-dot" style="background:rgb(${(NET_COLORS[r ? r.color : 0] || [120, 120, 120]).join(',')})"></span>`;
      if (!r) {
        const seen = f.seen ? agoText(f.seen) : 'never seen yet';
        return `<div class="gp-row"><span class="pp-dot off"></span><div class="gp-grow"><b>${e(f.n || 'Friend')}</b><small>Offline · ${e(seen)}${f.srv ? ' on ' + e(f.srv) : ''}${f.where ? ' · ' + e(f.where) : ''}</small></div>
          <button class="gp-btn" data-unf="${f.o}" title="Remove friend">✕</button></div>`;
      }
      return `<div class="gp-row">${dot}<div class="gp-grow"><b>${e(r.name)}</b>${fr ? ' <span title="Friend">⭐</span>' : ''}${role && role !== 'visitor' ? ` <span class="pp-role ${role}">${role}</span>` : ''}
        <small>📍 ${e(this.where(r.pos))} · ${this.dist(r.pos)}</small></div>
        <button class="gp-btn" data-tpq="${e(r.peer)}" title="Ask to teleport to them">📍 Go</button>
        <button class="gp-btn" data-tpi="${e(r.peer)}" title="Invite them here">📨 Invite</button>
        ${fr ? '' : r.owner ? `<button class="gp-btn" data-fr="${e(r.peer)}" title="Add friend">⭐</button>` : ''}
        ${me && r.owner ? `<button class="gp-btn" data-mod="${e(r.peer)}" title="Moderate">⚙️</button>` : ''}</div>`;
    };
    if (this.tab === 'online') {
      const peers = [...Net.peers.values()];
      html += Net.on ? (peers.length ? peers.map((r) => row(r)).join('') : '<div class="gp-empty">Nobody else is here right now.<br>Share the server code to invite your friends.</div>')
        : '<div class="gp-empty">You are playing alone.<br>Join a server from the menu to meet people.</div>';
    } else if (this.tab === 'friends') {
      const on = [], off = [];
      for (const f of Friends.list) { const r = Net.on && Friends.peerOf(f.o); (r ? on : off).push(r ? row(r) : row(null, f)); }
      html += on.join('') + off.join('') || '<div class="gp-empty">No friends yet.<br>Right-click a player and choose ⭐ Add friend, or use ⭐ in Online now.</div>';
    } else if (this.tab === 'admin') html += this.adminHtml();
    if (this.lastHtml === html && soft) return;
    this.lastHtml = html;
    p.body.innerHTML = html;
    this.bind();
  },
  adminHtml() {
    const s = Admin.state(), e = GPanel.esc, me = Admin.amAdmin();
    const owners = s.own.map((o) => `<span class="mp-chip">👑 ${e(s.nm[o] || 'Player')}${me && o !== Net.owner ? `<button data-unown="${o}">✕</button>` : ''}</span>`).join('') || '<span class="gp-dim">Nobody owns this server yet.</span>';
    let h = `<div class="pp-sec"><label>Owners</label><div>${owners}</div>${!s.own.length ? '<button class="gp-btn pri" data-claim>👑 Claim this server</button>' : ''}</div>`;
    if (!me) return h + '<p class="gp-dim">Only the owners can change the server settings.</p>';
    h += `<div class="pp-sec"><label>Who can build</label><div class="gp-tabs"><button data-build="all" class="${s.build === 'all' ? 'on' : ''}">Everyone</button><button data-build="members" class="${s.build === 'members' ? 'on' : ''}">Only members</button></div>
      <label>Player fights</label><div class="gp-tabs"><button data-pvp="1" class="${s.pvp ? 'on' : ''}">Allowed</button><button data-pvp="0" class="${!s.pvp ? 'on' : ''}">Off for everyone</button></div></div>`;
    const bans = Object.entries(s.ban).map(([o, n]) => `<span class="mp-chip">⛔ ${e(n)}<button data-unban="${o}" title="Lift the ban">✕</button></span>`).join('');
    const mem = s.mem.map((o) => `<span class="mp-chip">🔨 ${e(s.nm[o] || 'member')}<button data-unmem="${o}">✕</button></span>`).join('');
    h += `<div class="pp-sec"><label>Members</label><div>${mem || '<span class="gp-dim">None: add them with ⚙️ in Online now.</span>'}</div>${bans ? '<label>Banned</label><div>' + bans + '</div>' : ''}</div>`;
    const bl = Admin.backups().slice().reverse();
    h += `<div class="pp-sec"><label>Backups <span class="gp-dim">(kept in this browser · automatic every 20 min)</span></label>
      ${bl.map((b) => `<div class="gp-row"><div class="gp-grow"><b>${new Date(b.ts).toLocaleString()}</b><small>${b.auto ? 'Automatic' : 'By ' + e(b.by || '?')} · ${b.n} changed blocks</small></div><button class="gp-btn" data-restore="${b.ts}">↺ Restore</button></div>`).join('') || '<div class="gp-dim">No backups yet.</div>'}
      <button class="gp-btn ok" data-backup style="margin-top:6px">💾 Back up now</button></div>`;
    return h;
  },
  moderate(r) {
    const q = GPanel.open({ title: r.name, sub: 'Moderate', icon: '⚙️', width: 380 });
    const draw = () => {
      const s = Admin.state(), o = r.owner, muted = s.mute.includes(o);
      q.body.innerHTML = `<div class="gp-card" style="text-align:left"><p>Role: <b>${Admin.role(o)}</b></p><p class="gp-dim">📍 ${GPanel.esc(this.where(r.pos))}</p></div>
        <div class="pp-grid">
          <button class="gp-btn" data-a="mem">${s.mem.includes(o) ? '➖ Remove member' : '🔨 Make member'}</button>
          <button class="gp-btn" data-a="own">${s.own.includes(o) ? '➖ Remove admin' : '👑 Make admin'}</button>
          <button class="gp-btn" data-a="mute">${muted ? '🔊 Unmute' : '🔇 Mute chat'}</button>
          <button class="gp-btn" data-a="tp">📍 Go to them</button>
          <button class="gp-btn bad" data-a="kick">👢 Kick</button>
          <button class="gp-btn bad" data-a="ban">⛔ Ban</button>
        </div>`;
      q.body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'mem') Admin.set((s2) => { s2.mem = s2.mem.includes(o) ? s2.mem.filter((x) => x !== o) : [...s2.mem, o]; s2.nm[o] = r.name; });
        if (a === 'own') Admin.set((s2) => { s2.own = s2.own.includes(o) ? s2.own.filter((x) => x !== o) : [...s2.own, o]; s2.nm[o] = r.name; });
        if (a === 'mute') Admin.set((s2) => { s2.mute = s2.mute.includes(o) ? s2.mute.filter((x) => x !== o) : [...s2.mute, o]; });
        if (a === 'tp') { q.close(); if (this.p) this.p.close(); Commands.go([r.pos[0] + 1, r.pos[1], r.pos[2] + 1], 'Teleported to ' + r.name); return; }
        if (a === 'kick' || a === 'ban') { Admin.kick(r, a === 'ban'); q.close(); return; }
        draw();
      }));
    };
    draw();
  },
  bind() {
    const b = this.p.body, peer = (id) => Net.peers.get(id);
    b.querySelectorAll('[data-tab]').forEach((x) => x.addEventListener('click', () => { this.tab = x.dataset.tab; this.render(); }));
    b.querySelectorAll('[data-fr]').forEach((x) => x.addEventListener('click', () => this.requestFriend(peer(x.dataset.fr))));
    b.querySelectorAll('[data-unf]').forEach((x) => x.addEventListener('click', () => { Friends.remove(x.dataset.unf); this.render(); }));
    b.querySelectorAll('[data-tpq]').forEach((x) => x.addEventListener('click', () => this.askTp(peer(x.dataset.tpq), false)));
    b.querySelectorAll('[data-tpi]').forEach((x) => x.addEventListener('click', () => this.askTp(peer(x.dataset.tpi), true)));
    b.querySelectorAll('[data-mod]').forEach((x) => x.addEventListener('click', () => { const r = peer(x.dataset.mod); if (r) this.moderate(r); }));
    const q = (sel, fn) => b.querySelectorAll(sel).forEach((x) => x.addEventListener('click', () => fn(x)));
    q('[data-claim]', () => { Admin.claim(); this.render(); });
    q('[data-unown]', (x) => Admin.set((s) => { s.own = s.own.filter((o) => o !== x.dataset.unown); }));
    q('[data-unmem]', (x) => Admin.set((s) => { s.mem = s.mem.filter((o) => o !== x.dataset.unmem); }));
    q('[data-unban]', (x) => Admin.set((s) => { delete s.ban[x.dataset.unban]; }));
    q('[data-build]', (x) => Admin.set((s) => { s.build = x.dataset.build; }));
    q('[data-pvp]', (x) => Admin.set((s) => { s.pvp = x.dataset.pvp === '1'; }));
    q('[data-backup]', () => Admin.backup(false));
    q('[data-restore]', (x) => Ask.show('Restore the backup of ' + new Date(Number(x.dataset.restore)).toLocaleString() + '? Blocks changed since then go back.', () => Admin.restore(Number(x.dataset.restore)), null, 20));
  },

  // ---- requests ----
  cool: 0,
  requestFriend(r) {
    if (!r || !r.owner) return;
    Net.sendSoc(r.peer, { k: 'frq', o: Net.owner });
    G.ui.toast('⭐ Friend request sent to ' + r.name);
  },
  askTp(r, invite) {
    if (!r) return;
    if (Police.jail) { G.ui.toast('🚔 Not while you are in the cells'); return; }
    if (performance.now() < this.cool) { G.ui.toast('⏳ Wait a moment before asking again'); return; }
    this.cool = performance.now() + 8000;
    Net.sendSoc(r.peer, { k: invite ? 'tpi' : 'tpq' });
    G.ui.toast((invite ? '📨 Invitation sent to ' : '📍 Asked ') + r.name + (invite ? '' : ' to let you teleport'));
    if (this.p) this.p.close();
  },
  receive(d, from) {
    const r = Net.peers.get(from);
    const name = r ? r.name : 'Someone';
    switch (d.k) {
      case 'frq':
        if (!r || !r.owner) return true;
        if (Friends.get(r.owner)) { Net.sendSoc(from, { k: 'frok', o: Net.owner }); return true; }
        Ask.show('⭐ ' + name + ' wants to be your friend', () => { Friends.add(r.owner, r.name); Net.sendSoc(from, { k: 'frok', o: Net.owner }); G.ui.toast('⭐ You and ' + name + ' are friends'); }, () => Net.sendSoc(from, { k: 'frno' }));
        return true;
      case 'frok': if (r && r.owner) { Friends.add(r.owner, r.name); G.ui.toast('⭐ ' + name + ' accepted: you are friends'); sfx('achieve', null, 0.5, 1.2); this.refresh(); } return true;
      case 'frno': G.ui.toast(name + ' did not accept the friend request'); return true;
      case 'tpq':
        Ask.show('📍 ' + name + ' wants to teleport to you', () => { const p = G.player.pos; Net.sendSoc(from, { k: 'tpok', p: [r1(p[0]), r1(p[1]), r1(p[2])] }); }, (t) => Net.sendSoc(from, { k: 'tpno', t: !!t }));
        return true;
      case 'tpi':
        Ask.show('📨 ' + name + ' invites you to teleport to them', () => { if (r) this.teleportTo(r.pos, name); });
        return true;
      case 'tpok': {
        const p = Array.isArray(d.p) && d.p.length === 3 && d.p.every(Number.isFinite) ? d.p : r && r.pos;
        if (p) this.teleportTo(p, name);
        return true;
      }
      case 'tpno': G.ui.toast(d.t ? name + ' did not answer' : name + ' said no'); return true;
      case 'kick': {
        const o = r && r.owner;
        if (!o || !Admin.isOwner(o)) return true;          // only an admin can kick
        Admin.kicked((d.ban ? 'You were banned by ' : 'You were kicked by ') + name);
        return true;
      }
    }
    return false;
  },
  teleportTo(p, name) {
    if (Police.jail) return;
    if (G.vehicle) Vehicles.dismount(true);
    Commands.go([p[0] + 0.8, p[1], p[2] + 0.8], 'Teleported to ' + name);
  },
};

// ---------------------------------------------------------------- hooks ----
{
  Friends.load();
  PLAYER_ACTIONS.push({ k: 'friend', name: 'Add friend', icon: '⭐' }, { k: 'people', name: 'People…', icon: '👥' });
  const choose = Social.choose;
  Social.choose = function (i) {
    const it = this.menuKind === 'player' || this.menuKind !== 'wheel' ? PLAYER_ACTIONS[i] : null, peer = this.menuPeer;
    if (it && (it.k === 'friend' || it.k === 'people')) {
      this.closeMenu();
      const r = Net.peers.get(peer);
      if (it.k === 'people') People.open('online');
      else if (r && r.owner && Friends.get(r.owner)) G.ui.toast('⭐ ' + r.name + ' is already your friend');
      else People.requestFriend(r);
      return;
    }
    return choose.call(this, i);
  };
  const recv = Social.receive;
  Social.receive = function (d, from) {
    if (d && typeof d.k === 'string' && Net.on && People.receive(d, from)) return;
    if (d && d.k === 'hit' && Admin.on() && !Admin.state().pvp) { Net.sendSoc(from, { k: 'nopvp' }); return; }
    return recv.call(this, d, from);
  };
  const attack = Social.attack;
  Social.attack = function (r) {
    if (Admin.on() && !Admin.state().pvp) { Act.swingHand(); G.ui.toast('⚔ Fights are off on this server'); return; }
    return attack.call(this, r);
  };
  // everyone says who they are (servers already do), so friends work in the shared world too
  const pres = Net.presenceData;
  Net.presenceData = function () { const d = pres.call(this); d.ow = this.owner; return d; };
  // other players' edits and chat
  const applyOp = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (Admin.on() && r && r.owner) {
      const s = Admin.state();
      if (s.ban[r.owner]) return;
      if (o[1] === 'b' && !Admin.canBuild(r.owner)) return;
      if (o[1] === 'c' && s.mute.includes(r.owner)) return;
    }
    return applyOp.call(this, r, o);
  };
  // our own edits
  const noBuild = () => {
    if (Admin.canBuild(Net.owner)) return false;
    if (!People.warnT || performance.now() > People.warnT) { People.warnT = performance.now() + 2500; G.ui.toast('🔒 Only members can build on this server'); }
    return true;
  };
  const place = Act.placeBlock;
  Act.placeBlock = function (hit) { if (Admin.on() && noBuild()) return false; return place.call(this, hit); };
  const mining = Act.updateMining;
  Act.updateMining = function (dt, now) {
    if (G.mouse.left && this.target && this.target.block && Admin.on() && noBuild()) { this.mine.pos = null; this.mine.progress = 0; return; }
    return mining.call(this, dt, now);
  };
  // shared state
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) { if (k === 'admin') { Admin.apply(v, true); return; } return apply.call(this, k, v); };
  const greet = SharedState.greet;
  SharedState.greet = function () { greet.call(this); const s = Admin.state(); if (s.own.length) Net.sendState({ k: 'admin', v: s, t: this.times.get('admin') || 1 }); };
  // remember which servers you created
  const create = Net.createServer;
  Net.createServer = function (name, mode) {
    const orig = this.join;
    let made = null;
    this.join = function (s) { made = s; s.mine = true; return orig.call(this, s); };
    try { return create.call(this, name, mode); } finally { this.join = orig; if (made) { made.mine = true; this.saveServers(); } }
  };
  const loadS = Net.loadServers;
  Net.loadServers = function () {
    const raw = storageGet(SERVERS_KEY);
    loadS.call(this);
    if (Array.isArray(raw)) for (const s of this.servers) { const r0 = raw.find((q) => q && q.code === s.code); if (r0 && r0.mine) s.mine = true; }
  };
  const join = Net.join;
  Net.join = function (server) { Admin.claimT = 0; Admin.autoT = 0; Admin.code = null; return join.call(this, server); };
  // O opens the People panel
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyO' || e.repeat || !G.playing || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
    if (G.screenOpen && !People.p) return;
    e.preventDefault();
    People.open();
  });
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Friends.update(dt || 0.016); Admin.update(dt || 0.016); };
  PC.add({ key: 'people', icon: '👥', name: 'People', closes: true, run() { People.open(); } });
  if (typeof Commands !== 'undefined') {
    const run = Commands.run;
    Commands.run = function (text) {
      if (/^\/(friends|people)\b/i.test(text)) { People.open(/friends/i.test(text) ? 'friends' : 'online'); return; }
      if (/^\/(admin|server)\b/i.test(text)) { People.open('admin'); return; }
      return run.call(this, text);
    };
  }
}
