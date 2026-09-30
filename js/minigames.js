'use strict';
// Group minigames (the Minigames app). One game at a time on a server: whoever starts it hosts it
// (SharedState 'mg' carries the state, the players' moves reach the host as op 'MG').
// - Treasure hunt: six golden chests hidden around; a hot/cold meter points to the nearest one
//   and they shine when you are close. Walk into one to take it. Most chests wins.
// - Hide and seek: the seeker counts to 45 with the screen dark while everybody hides (their
//   name tags vanish for the seeker); whoever is caught joins the seekers. Alone, five kids
//   from the neighbourhood hide and you look for them.
// - City race: a place in the city is drawn (a metro station, the airport, the AVE, the bank...)
//   with a beam of light over it. Get there first, by any means: run, metro, bus, taxi, car.
// The winners get coins; the HUD shows the time and the scores.

const MG_KINDS = {
  hunt: { icon: '💰', name: ED('Caça del tresor', 'Treasure hunt'), desc: ED('Sis cofres d\'or amagats al voltant. El detector diu fred o calent.', 'Six golden chests hidden around. The detector says hot or cold.'), dur: 300 },
  hide: { icon: '🙈', name: ED('Fet i amagar', 'Hide and seek'), desc: ED('Qui para compta fins a 45; els atrapats també paren. Sol: troba cinc nens amagats.', 'The seeker counts to 45; whoever is caught seeks too. Alone: find five hidden kids.'), dur: 285 },
  race: { icon: '🏁', name: ED('Cursa per la ciutat', 'City race'), desc: ED('Surt un lloc de la ciutat amb un feix de llum: arriba-hi primer, com vulguis.', 'A place in the city lights up: get there first, any way you like.'), dur: 300 },
};

const Mini = {
  g: null, t: 0, dirty: false, kids: [], blindEl: null, hudEl: null, lastSeen: null,
  me() { return Net.owner; },
  host() { return this.g && this.g.host === Net.owner; },
  in() { return !!(this.g && this.g.players[Net.owner]); },
  now() { return Date.now(); },
  left() { const g = this.g; return g ? Math.max(0, g.t0 + g.dur * 1000 - this.now()) / 1000 : 0; },
  send(ev, ...a) { if (this.host()) this.event(Net.owner, Net.name, [ev, ...a]); else if (Net.on) Net.op(['MG', this.g.id, ev, ...a]); },
  save() { this.dirty = false; if (Net.on) SharedState.put('mg', this.g); },

  // ---- starting ----
  start(kind) {
    if (this.g && !this.g.over) { G.ui.toast('A game is already on: ' + MG_KINDS[this.g.kind].name); return; }
    const K = MG_KINDS[kind], p = G.player.pos;
    const g = this.g = { id: 'g' + Date.now().toString(36), kind, host: Net.owner, hn: Net.name, t0: this.now() + 8000, dur: K.dur, seed: (Math.random() * 1e9) | 0, players: { [Net.owner]: { n: Net.name, s: 0, role: 'player' } }, data: {}, over: false, at: [Math.round(p[0]), Math.round(p[2])] };
    if (kind === 'hunt') g.data.spots = this.hideSpots(p, 6, 26, 75).map((q) => [...q, null]);
    if (kind === 'race') g.data.target = this.raceTarget(p);
    if (kind === 'hide') { g.players[Net.owner].role = 'seek'; g.data.hideEnd = g.t0 + 45000; g.t0 += 0; }
    if (kind === 'race' && !g.data.target) { this.g = null; G.ui.toast('No place to race to around here'); return; }
    if (kind === 'hunt' && g.data.spots.length < 4) { this.g = null; G.ui.toast('Not enough open ground around here'); return; }
    this.save();
    if (Net.on) Net.op(['MG', g.id, 'invite', kind]);
    G.ui.banner(K.icon, K.name + ' starts in 8 seconds!');
    sfx('ave_ding', null, 0.8, 1);
  },
  join() {
    if (!this.g || this.g.over || this.in()) return;
    this.send('join', Net.name);
    if (!this.host()) { this.g.players[Net.owner] = { n: Net.name, s: 0, role: this.g.kind === 'hide' ? 'hide' : 'player' }; }
    G.ui.toast(MG_KINDS[this.g.kind].icon + ' You are in!');
  },
  quit() {
    if (!this.g) return;
    if (this.host()) { this.g.over = true; this.g.result = 'stopped'; this.save(); this.cleanup(); this.g = null; G.ui.toast('Game stopped'); return; }
    this.send('quit');
    delete this.g.players[Net.owner];
    this.g = null;
    this.cleanup();
  },

  // spots on open ground round (x, z), not too close together
  hideSpots(p, n, r0, r1) {
    const w = G.world, out = [];
    for (let tries = 0; tries < 400 && out.length < n; tries++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      const x = Math.floor(p[0] + Math.cos(a) * r), z = Math.floor(p[2] + Math.sin(a) * r);
      if (!w.isLoaded(x, z)) continue;
      let y = -1;
      for (let yy = Math.min(CH - 3, Math.floor(p[1]) + 20); yy > Math.floor(p[1]) - 20; yy--) {
        const id = w.getBlock(x, yy, z);
        if (BLOCK_SOLID[id] && BLOCK_RT[id] !== RT_CROSS && !IS_LIQUID(id)) { y = yy + 1; break; }
        if (IS_LIQUID(id)) break;
      }
      if (y < 0 || BLOCK_SOLID[w.getBlock(x, y, z)] || BLOCK_SOLID[w.getBlock(x, y + 1, z)]) continue;
      if (out.some((q) => Math.hypot(q[0] - x, q[2] - z) < 14)) continue;
      out.push([x, y, z]);
    }
    return out;
  },
  raceTarget(p) {
    const list = [];
    const st = typeof City !== 'undefined' ? City.plan() : null;
    if (st) {
      const m = st.metro;
      if (m) for (const s of m.line.stops) list.push({ name: ED('Metro ', 'Metro ') + s.name, x: s.at[0], y: st.y, z: s.at[2] });
      if (st.campus && st.campus.bank) list.push({ name: ED('Banc Central', 'Central Bank'), x: st.campus.bank.x0 - 3, y: st.y, z: (st.campus.bank.z0 + st.campus.bank.z1) / 2 });
      if (st.airport) list.push({ name: ED('Aeroport', 'Airport'), x: st.x + 94, y: st.y, z: st.z });
      if (st.campus && st.campus.pitch) list.push({ name: ED('Camp de futbol', 'Football pitch'), x: (st.campus.pitch.x0 + st.campus.pitch.x1) / 2, y: st.y, z: st.campus.pitch.z0 - 2 });
      for (const pl of (st.plots || []).filter((_, i) => i % 5 === 0)) list.push({ name: ED('Solar ', 'Plot ') + pl.id.slice(1), x: pl.sign[0], y: st.y, z: pl.sign[1] });
      const L = typeof Ave !== 'undefined' ? Ave.line() : null;
      if (L) list.push({ name: ED('Estació AVE', 'AVE station'), x: (L.xs + L.xe) / 2, y: L.F, z: L.z + 10 });
    }
    const far = list.filter((q) => Math.hypot(q.x - p[0], q.z - p[2]) > 90);
    const pick = (far.length ? far : list)[Math.floor(Math.random() * Math.max(1, (far.length ? far : list).length))];
    return pick ? { ...pick, x: Math.round(pick.x), z: Math.round(pick.z) } : null;
  },

  // ---- the host decides ----
  event(owner, name, ev) {
    const g = this.g;
    if (!g || g.over) return;
    const P = g.players, [k] = ev;
    if (k === 'join' && !P[owner]) { P[owner] = { n: String(name || 'Player').slice(0, 16), s: 0, role: g.kind === 'hide' ? (this.now() < g.data.hideEnd ? 'hide' : 'seek') : 'player' }; this.dirty = true; }
    if (!P[owner]) return;
    if (k === 'quit') { delete P[owner]; this.dirty = true; }
    if (k === 'take' && g.kind === 'hunt') {
      const s = g.data.spots[ev[1] | 0];
      if (s && !s[3]) { s[3] = owner; P[owner].s++; this.dirty = true; if (g.data.spots.every((q) => q[3])) this.finish(); }
    }
    if (k === 'catch' && g.kind === 'hide' && P[owner].role === 'seek') {
      const h = P[ev[1]];
      if (h && h.role === 'hide') { h.role = 'seek'; h.caughtAt = this.now(); P[owner].s += 1; this.dirty = true; if (!Object.values(P).some((q) => q.role === 'hide')) this.finish(); }
    }
    if (k === 'done' && g.kind === 'race' && !P[owner].time) {
      P[owner].time = Math.max(1, Number(ev[1]) || 0); this.dirty = true;
      if (Object.values(P).every((q) => q.time)) this.finish();
    }
  },
  finish() {
    const g = this.g;
    if (!g || g.over) return;
    g.over = true;
    const P = g.players;
    if (g.kind === 'hide') for (const q of Object.values(P)) if (q.role === 'hide') q.s += 3;
    let best = null;
    for (const [o, q] of Object.entries(P)) {
      const v = g.kind === 'race' ? (q.time ? 1e6 - q.time : -1) : q.s;
      if (v > 0 && (!best || v > best[1])) best = [o, v];
    }
    g.win = best ? best[0] : null;
    this.save();
  },

  tick(dt) {
    const g = this.g;
    if (!g) { this.hud(); return; }
    const now = this.now(), P = g.players, me = P[Net.owner], p = G.player.pos;
    if (this.host() && !g.over) {
      if (now > g.t0 + g.dur * 1000) this.finish();
      if (this.dirty) this.save();
    }
    if (g.over) {
      if (!this.ended) {
        this.ended = g.id;
        const won = g.win === Net.owner;
        const K = MG_KINDS[g.kind];
        if (me) {
          if (won) { Shops.earn(120); G.ui.banner('🏆', K.name + ' · you win! +120 coins'); sfx('achieve', null, 1, 1); if (typeof Football !== 'undefined' && Football.fireworks) Football.fireworks(p.slice()); }
          else G.ui.banner(K.icon, K.name + ' · ' + (g.win ? (P[g.win] ? P[g.win].n : 'someone') + ' wins' : 'nobody wins') + (me.s ? ' · you got ' + me.s : ''));
          if (!won && me.s) Shops.earn(me.s * 15);
        }
        this.cleanup();
        setTimeout(() => { if (this.g && this.g.id === this.ended) this.g = null; }, 12000);
      }
      this.hud();
      return;
    }
    if (!me) { this.hud(); return; }
    const started = now >= g.t0;
    // treasure hunt: take a chest by walking into it
    if (g.kind === 'hunt' && started) g.data.spots.forEach((s, i) => { if (!s[3] && Math.hypot(s[0] + 0.5 - p[0], s[2] + 0.5 - p[2]) < 1.6 && Math.abs(s[1] - p[1]) < 2.5 && this.lastTake !== g.id + i) { this.lastTake = g.id + i; this.send('take', i); sfx('achieve', null, 0.7, 1.4); G.ui.toast('💰 Treasure!'); Particles.poof && Particles.poof(s[0] + 0.5, s[1] + 0.8, s[2] + 0.5, 1.5, 1); } });
    // hide and seek
    if (g.kind === 'hide') {
      const counting = me.role === 'seek' && now < g.data.hideEnd && !me.caughtAt;
      this.blind(counting ? Math.ceil((g.data.hideEnd - now) / 1000) : 0);
      if (me.role === 'seek' && now >= g.data.hideEnd) {
        for (const r of Net.peers.values()) {
          const q = r.owner && P[r.owner];
          if (q && q.role === 'hide' && Math.hypot(r.pos[0] - p[0], r.pos[2] - p[2]) < 2.3 && Math.abs(r.pos[1] - p[1]) < 2.5 && this.caughtT !== r.owner) {
            this.caughtT = r.owner; this.send('catch', r.owner); G.ui.toast('🙈 Caught ' + q.n + '!'); sfx('pling', null, 0.8, 1.2);
          }
        }
        // alone: the hidden kids
        for (const m of this.kids) if (!m.removed && !m.found && Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]) < 2.3 && Math.abs(m.pos[1] - p[1]) < 2.5) {
          m.found = true; me.s++; this.dirty = true; sfx('villager_yes', m.pos, 0.9, 1.4); G.ui.toast('🙈 Found ' + m.name + '! (' + me.s + '/5)');
          Particles.poof && Particles.poof(m.pos[0], m.pos[1] + 1, m.pos[2], 1, 1);
          setTimeout(() => { m.removed = true; }, 1200);
          if (this.kids.every((k) => k.found)) this.finish();
        }
      }
      if (this.host() && !Net.peers.size && !this.kids.length && now >= g.t0 - 7000) this.spawnKids(g);
    }
    // race
    if (g.kind === 'race' && started && !me.time && g.data.target) {
      const T = g.data.target;
      if (Math.hypot(T.x - p[0], T.z - p[2]) < 5 && Math.abs(T.y - p[1]) < 8) { const t = (now - g.t0) / 1000; me.time = t; this.send('done', t); G.ui.toast('🏁 ' + t.toFixed(1) + ' s!'); sfx('achieve', null, 0.9, 1.1); }
    }
    if (started && !this.goSaid) { this.goSaid = g.id; G.ui.banner(MG_KINDS[g.kind].icon, g.kind === 'hide' ? (me.role === 'seek' ? 'Count to 45…' : 'Hide!') : 'Go!'); sfx('ave_ding', null, 0.9, 1.3); }
    this.hud();
  },
  spawnKids(g) {
    const spots = this.hideSpots(G.player.pos, 5, 12, 42);
    for (const s of spots) {
      const m = Ents.spawnMob('villager', s[0] + 0.5, s[1] + 0.01, s[2] + 0.5);
      if (!m) continue;
      m.persistent = true; m.mgKid = true; m.prof = 'student';
      m.skin = STUDENT_SKINS.length ? STUDENT_SKINS[Math.floor(Math.random() * STUDENT_SKINS.length)] : 0;
      m.name = VILLAGER_NAMES[Math.floor(Math.random() * VILLAGER_NAMES.length)];
      m.home = [s[0] + 0.5, s[2] + 0.5]; m.homeR = 0.2; m.sneak = true;
      this.kids.push(m);
    }
    g.data.kids = this.kids.length;
  },
  cleanup() { for (const m of this.kids) m.removed = true; this.kids = []; this.blind(0); },
  blind(n) {
    if (!n) { if (this.blindEl) { this.blindEl.remove(); this.blindEl = null; } return; }
    if (!this.blindEl) { this.blindEl = document.createElement('div'); this.blindEl.id = 'mgBlind'; document.body.append(this.blindEl); }
    const h = `<div><i>🙈</i><b>${n}</b><span>Counting… no peeking!</span></div>`;
    if (this.blindEl.innerHTML !== h) this.blindEl.innerHTML = h;
  },

  hud() {
    const g = this.g;
    let el = this.hudEl;
    if (!g || (!this.in() && g.over) || G.onTitle) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = this.hudEl = document.createElement('div'); el.id = 'mgHud'; document.body.append(el); }
    const K = MG_KINDS[g.kind], me = g.players[Net.owner], now = this.now(), p = G.player.pos;
    const secs = g.over ? 0 : now < g.t0 ? Math.ceil((g.t0 - now) / 1000) : Math.ceil(this.left());
    let line = '';
    if (!me) line = '📱 Minigames to join';
    else if (now < g.t0) line = 'Starting in ' + secs + ' s';
    else if (g.kind === 'hunt') {
      let d = Infinity;
      for (const s of g.data.spots) if (!s[3]) d = Math.min(d, Math.hypot(s[0] - p[0], s[2] - p[2]));
      const heat = d < 8 ? '🔥 Burning!' : d < 18 ? '♨️ Hot' : d < 35 ? '🌤️ Warm' : d < 60 ? '❄️ Cold' : '🧊 Freezing';
      line = heat + ' · ' + g.data.spots.filter((s) => !s[3]).length + ' left';
    } else if (g.kind === 'hide') line = me.role === 'seek' ? (now < g.data.hideEnd ? 'Counting…' : '👀 Seek! ' + (this.kids.length ? this.kids.filter((k) => !k.found).length + ' kids hidden' : Object.values(g.players).filter((q) => q.role === 'hide').length + ' still hiding')) : '🤫 Hide! ' + (now < g.data.hideEnd ? Math.ceil((g.data.hideEnd - now) / 1000) + ' s before they look' : 'they are looking');
    else if (g.kind === 'race') {
      const T = g.data.target, d = Math.hypot(T.x - p[0], T.z - p[2]);
      const ang = Math.atan2(T.x - p[0], T.z - p[2]) - Math.atan2(-Math.sin(G.player.yaw), -Math.cos(G.player.yaw));
      line = me.time ? '🏁 ' + me.time.toFixed(1) + ' s' : `<i class="mg-arrow" style="transform:rotate(${(-ang).toFixed(2)}rad)">⬆</i> ${BZ.esc(T.name)} · ${Math.round(d)} m`;
    }
    const board = Object.entries(g.players).sort((a, b) => g.kind === 'race' ? (a[1].time || 1e9) - (b[1].time || 1e9) : b[1].s - a[1].s).slice(0, 4)
      .map(([o, q]) => `<span class="${o === Net.owner ? 'me' : ''}">${g.kind === 'hide' ? (q.role === 'seek' ? '👀' : '🤫') : ''}${BZ.esc(q.n)} <b>${g.kind === 'race' ? (q.time ? q.time.toFixed(1) + 's' : '…') : q.s}</b></span>`).join('');
    el.innerHTML = `<div class="mg-top"><b>${K.icon} ${K.name}</b><em>${g.over ? 'Finished' : Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')}</em></div><div class="mg-line">${line}</div><div class="mg-board">${board}</div>`;
    el.classList.add('show');
  },

  render(cp) {
    const g = this.g;
    if (!g || g.over || !this.in()) return;
    const uv = () => Vehicles.swatchUV('white');
    if (g.kind === 'hunt' && this.now() >= g.t0) for (const s of g.data.spots) {
      if (s[3] || Math.hypot(s[0] - cp[0], s[2] - cp[2]) > 30) continue;
      const m = XF.chain(XF.t(s[0] + 0.5 - cp[0], s[1] - cp[1] + 0.15 + Math.sin(G.time * 2 + s[0]) * 0.08, s[2] + 0.5 - cp[2]), XF.ry(G.time * 0.8 + s[2]));
      ER.lightAt(s[0] + 0.5, s[1] + 1, s[2] + 0.5);
      ER.color = [0.55, 0.32, 0.12]; ER.box(m, -0.4, 0, -0.28, 0.4, 0.42, 0.28, uv);
      ER.color = [0.62, 0.36, 0.14]; ER.box(m, -0.42, 0.42, -0.3, 0.42, 0.62, 0.3, uv);
      ER.ov = 3; ER.color = [1, 0.82, 0.2];
      ER.box(m, -0.43, 0.36, -0.31, 0.43, 0.46, 0.31, uv); ER.box(m, -0.06, 0.22, 0.3, 0.06, 0.46, 0.33, uv);
      ER.box(m, -0.3, 0.63, -0.2, 0.3, 0.72, 0.2, uv);
      ER.ov = 0;
      if (Math.random() < 0.08) Particles.poof && Particles.poof(s[0] + 0.5 + rand(-0.4, 0.4), s[1] + 0.9, s[2] + 0.5 + rand(-0.4, 0.4), 0.3, 1);
    }
    if (g.kind === 'race' && g.data.target) {
      const T = g.data.target;
      const m = XF.t(T.x + 0.5 - cp[0], T.y - cp[1], T.z + 0.5 - cp[2]);
      ER.ov = 3; ER.color = [1, 0.85, 0.2];
      ER.box(m, -0.35, 0, -0.35, 0.35, 90, 0.35, uv);
      ER.color = [1, 1, 1]; ER.box(m, -0.12, 0, -0.12, 0.12, 92, 0.12, uv);
      ER.ov = 0;
    }
    ER.color = [1, 1, 1];
  },

  open() {
    const q = GPanel.open({ title: ED('Minijocs', 'Minigames'), sub: Net.on ? 'Everyone on the server can join' : 'Playing alone', icon: '🎯', cls: 'gp-mg', width: 560 });
    const draw = () => {
      const g = this.g, e = BZ.esc;
      const cur = g && !g.over ? `<div class="mg-cur"><b>${MG_KINDS[g.kind].icon} ${MG_KINDS[g.kind].name}</b><span>Hosted by ${e(g.hn)} · ${Object.keys(g.players).length} playing</span>
        ${this.in() ? `<button class="gp-btn bad" data-a="quit">${this.host() ? 'Stop the game' : 'Leave'}</button>` : '<button class="gp-btn ok" data-a="join">Join</button>'}</div>` : '';
      q.body.innerHTML = cur + `<div class="mg-cards">${Object.entries(MG_KINDS).map(([k, K]) => `<button class="mg-card" data-k="${k}" ${g && !g.over ? 'disabled' : ''}><i>${K.icon}</i><b>${K.name}</b><span>${K.desc}</span><em>${Math.round(K.dur / 60)} min · 🏆 120</em></button>`).join('')}</div>`;
      q.body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { q.close(); this.start(b.dataset.k); }));
      q.body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.a === 'join') this.join(); else this.quit(); draw(); }));
    };
    draw();
  },
};

{
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'MG') {
      const g = Mini.g, owner = r && r.owner;
      if (o[3] === 'invite') { const K = MG_KINDS[o[4]]; if (K && r) G.ui.toast(K.icon + ' ' + r.name + ' started ' + K.name + ' · 📱 Minigames to join', 5000); return; }
      if (g && g.id === o[2] && Mini.host() && owner) Mini.event(owner, r.name, o.slice(3));
      return;
    }
    return ap.call(this, r, o);
  };
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) {
    if (k === 'mg') {
      if (!v || typeof v !== 'object' || !MG_KINDS[v.kind] || !v.players) { if (Mini.g && !Mini.host()) { Mini.cleanup(); Mini.g = null; } return; }
      if (Mini.host() && Mini.g && !Mini.g.over && v.id !== Mini.g.id) return;
      const mine = Mini.g && Mini.g.id === v.id ? Mini.g.players[Net.owner] : null;
      Mini.g = v;
      if (mine && !v.players[Net.owner] && !v.over) v.players[Net.owner] = mine;
      return;
    }
    return apply.call(this, k, v);
  };
  // the seeker does not see where the hiders are
  const dt = Net.drawTags;
  Net.drawTags = function () {
    dt.call(this);
    const g = Mini.g, me = g && g.players[Net.owner];
    if (!g || g.over || g.kind !== 'hide' || !me || me.role !== 'seek') return;
    for (const r of this.peers.values()) { const q = r.owner && g.players[r.owner]; if (q && q.role === 'hide' && r.tag) r.tag.style.display = 'none'; }
  };
  // no moving while you count
  const upd = Player.prototype.update;
  Player.prototype.update = function (dt2, input) {
    if (this === G.player && Mini.blindEl) { this.vel[0] = this.vel[2] = 0; return; }
    return upd.call(this, dt2, input);
  };
  const kp = Ents.keepable;
  Ents.keepable = function (m) { if (m.mgKid) return false; return kp.call(this, m); };
  const fu = Furniture.update;
  Furniture.update = function (d) { fu.call(this, d); try { Mini.tick(d || 0.016); } catch (e) { console.warn('Blocklands: minigames', e); } };
  const wr = Weather.render;
  Weather.render = function (cp, ...a) { const r = wr.call(this, cp, ...a); try { Mini.render(cp); } catch (e) { /* ignore */ } return r; };
  PC.add({ key: 'minigames', icon: '🎯', name: ED('Minijocs', 'Minigames'), run() { Mini.open(); } });
}
